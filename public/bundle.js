(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
/* eslint-env browser */
module.exports = typeof self == 'object' ? self.FormData : window.FormData;

},{}],2:[function(require,module,exports){
(function (global){
(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
	typeof define === 'function' && define.amd ? define(['exports'], factory) :
	(global = global || self, factory(global.ky = {}));
}(this, function (exports) { 'use strict';

	/*! MIT License © Sindre Sorhus */

	const getGlobal = property => {
		/* istanbul ignore next */
		if (typeof self !== 'undefined' && self && property in self) {
			return self[property];
		}

		/* istanbul ignore next */
		if (typeof window !== 'undefined' && window && property in window) {
			return window[property];
		}

		if (typeof global !== 'undefined' && global && property in global) {
			return global[property];
		}

		/* istanbul ignore next */
		if (typeof globalThis !== 'undefined' && globalThis) {
			return globalThis[property];
		}
	};

	const document = getGlobal('document');
	const Headers = getGlobal('Headers');
	const Response = getGlobal('Response');
	const fetch = getGlobal('fetch');
	const AbortController = getGlobal('AbortController');

	const isObject = value => value !== null && typeof value === 'object';
	const supportsAbortController = typeof getGlobal('AbortController') === 'function';

	const deepMerge = (...sources) => {
		let returnValue = {};

		for (const source of sources) {
			if (Array.isArray(source)) {
				if (!(Array.isArray(returnValue))) {
					returnValue = [];
				}

				returnValue = [...returnValue, ...source];
			} else if (isObject(source)) {
				for (let [key, value] of Object.entries(source)) {
					if (isObject(value) && Reflect.has(returnValue, key)) {
						value = deepMerge(returnValue[key], value);
					}

					returnValue = {...returnValue, [key]: value};
				}
			}
		}

		return returnValue;
	};

	const requestMethods = [
		'get',
		'post',
		'put',
		'patch',
		'head',
		'delete'
	];

	const responseTypes = [
		'json',
		'text',
		'formData',
		'arrayBuffer',
		'blob'
	];

	const retryMethods = new Set([
		'get',
		'put',
		'head',
		'delete',
		'options',
		'trace'
	]);

	const retryStatusCodes = new Set([
		408,
		413,
		429,
		500,
		502,
		503,
		504
	]);

	const retryAfterStatusCodes = new Set([
		413,
		429,
		503
	]);

	class HTTPError extends Error {
		constructor(response) {
			super(response.statusText);
			this.name = 'HTTPError';
			this.response = response;
		}
	}

	class TimeoutError extends Error {
		constructor() {
			super('Request timed out');
			this.name = 'TimeoutError';
		}
	}

	const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

	// `Promise.race()` workaround (#91)
	const timeout = (promise, ms, abortController) => new Promise((resolve, reject) => {
		/* eslint-disable promise/prefer-await-to-then */
		promise.then(resolve).catch(reject);
		delay(ms).then(() => {
			reject(new TimeoutError());
			abortController.abort();
		});
		/* eslint-enable promise/prefer-await-to-then */
	});

	const normalizeRequestMethod = input => requestMethods.includes(input) ? input.toUpperCase() : input;

	class Ky {
		constructor(input, {
			timeout = 10000,
			hooks,
			throwHttpErrors = true,
			searchParams,
			json,
			...otherOptions
		}) {
			this._retryCount = 0;

			this._options = {
				method: 'get',
				credentials: 'same-origin', // TODO: This can be removed when the spec change is implemented in all browsers. Context: https://www.chromestatus.com/feature/4539473312350208
				retry: 2,
				...otherOptions
			};

			if (supportsAbortController) {
				this.abortController = new AbortController();
				if (this._options.signal) {
					this._options.signal.addEventListener('abort', () => {
						this.abortController.abort();
					});
				}

				this._options.signal = this.abortController.signal;
			}

			this._options.method = normalizeRequestMethod(this._options.method);
			this._options.prefixUrl = String(this._options.prefixUrl || '');
			this._input = String(input || '');

			if (this._options.prefixUrl && this._input.startsWith('/')) {
				throw new Error('`input` must not begin with a slash when using `prefixUrl`');
			}

			if (this._options.prefixUrl && !this._options.prefixUrl.endsWith('/')) {
				this._options.prefixUrl += '/';
			}

			this._input = this._options.prefixUrl + this._input;

			if (searchParams) {
				const url = new URL(this._input, document && document.baseURI);
				if (typeof searchParams === 'string' || (URLSearchParams && searchParams instanceof URLSearchParams)) {
					url.search = searchParams;
				} else if (Object.values(searchParams).every(param => typeof param === 'number' || typeof param === 'string')) {
					url.search = new URLSearchParams(searchParams).toString();
				} else {
					throw new Error('The `searchParams` option must be either a string, `URLSearchParams` instance or an object with string and number values');
				}

				this._input = url.toString();
			}

			this._timeout = timeout;
			this._hooks = deepMerge({
				beforeRequest: [],
				afterResponse: []
			}, hooks);
			this._throwHttpErrors = throwHttpErrors;

			const headers = new Headers(this._options.headers || {});

			if (json) {
				if (this._options.body) {
					throw new Error('The `json` option cannot be used with the `body` option');
				}

				headers.set('content-type', 'application/json');
				this._options.body = JSON.stringify(json);
			}

			this._options.headers = headers;

			const fn = async () => {
				let response = await this._fetch();

				for (const hook of this._hooks.afterResponse) {
					// eslint-disable-next-line no-await-in-loop
					const modifiedResponse = await hook(response.clone());

					if (modifiedResponse instanceof Response) {
						response = modifiedResponse;
					}
				}

				if (!response.ok && this._throwHttpErrors) {
					throw new HTTPError(response);
				}

				return response;
			};

			const isRetriableMethod = retryMethods.has(this._options.method.toLowerCase());
			const result = isRetriableMethod ? this._retry(fn) : fn();

			for (const type of responseTypes) {
				result[type] = async () => {
					return (await result).clone()[type]();
				};
			}

			return result;
		}

		_calculateRetryDelay(error) {
			this._retryCount++;

			if (this._retryCount < this._options.retry && !(error instanceof TimeoutError)) {
				if (error instanceof HTTPError) {
					if (!retryStatusCodes.has(error.response.status)) {
						return 0;
					}

					const retryAfter = error.response.headers.get('Retry-After');
					if (retryAfter && retryAfterStatusCodes.has(error.response.status)) {
						let after = Number(retryAfter);
						if (Number.isNaN(after)) {
							after = Date.parse(retryAfter) - Date.now();
						} else {
							after *= 1000;
						}

						return after;
					}

					if (error.response.status === 413) {
						return 0;
					}
				}

				const BACKOFF_FACTOR = 0.3;
				return BACKOFF_FACTOR * (2 ** (this._retryCount - 1)) * 1000;
			}

			return 0;
		}

		async _retry(fn) {
			try {
				return await fn();
			} catch (error) {
				const ms = this._calculateRetryDelay(error);
				if (ms !== 0 && this._retryCount > 0) {
					await delay(ms);
					return this._retry(fn);
				}

				if (this._throwHttpErrors) {
					throw error;
				}
			}
		}

		async _fetch() {
			for (const hook of this._hooks.beforeRequest) {
				// eslint-disable-next-line no-await-in-loop
				await hook(this._options);
			}

			return timeout(fetch(this._input, this._options), this._timeout, this.abortController);
		}
	}

	const createInstance = (defaults = {}) => {
		if (!isObject(defaults) || Array.isArray(defaults)) {
			throw new TypeError('The `defaultOptions` argument must be an object');
		}

		const ky = (input, options) => new Ky(input, deepMerge({}, defaults, options));

		for (const method of requestMethods) {
			ky[method] = (input, options) => new Ky(input, deepMerge({}, defaults, options, {method}));
		}

		ky.extend = defaults => createInstance(defaults);

		return ky;
	};

	var index = createInstance();

	exports.HTTPError = HTTPError;
	exports.TimeoutError = TimeoutError;
	exports.default = index;

	Object.defineProperty(exports, '__esModule', { value: true });

}));

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],3:[function(require,module,exports){
const Model = require('./model');
const View = require('./view');
const Controller = require('./controller');

// create MVC instances
const model = new Model();
const view = new View();
const controller = new Controller(model, view);

},{"./controller":4,"./model":5,"./view":6}],4:[function(require,module,exports){
const FormData = require('form-data');
const ky = require('ky/umd').default;

module.exports = class Controller {

  /**
	 * @param {Model} model A Model instance
	 * @param {View} view A View instance
	 */
  constructor(model, view) {
    this.model = model;
    this.view = view;

    // bind event handlers
    view.bindUpload(this.upload.bind(this));
    view.bindDraw(this.draw.bind(this));
    view.bindReset(this.reset.bind(this));
  }

  /**
   * Post ecospold2 file to server, store the parsed activity and show
   * the name and the geography shortname in a modal
   *
   * @param {File} file ecospold2 file to upload
   */
  upload(file) {
    this.view.hideUpload();
    this.view.showSpinner();

    // create readable "multipart/form-data" stream
    const form = new FormData();

    // append ecospold2 file to form
    form.append('ecospold2', file);

    // call API to parse ecospold2 file and wait for activity object
    (async () => {
      const response = await ky.post(
        'https://elegantupr-api.herokuapp.com/parser', {body: form}
      );
      const activity = await response.json();

      // store activity object
      this.model.setActivity(activity);

      // show modal with activity name and geography shortname
      this.view.hideSpinner();
      this.view.showModal(activity);
    })();
  }

  /**
   * Post activity object to server and draw a chart of the returned activity
   * with filtered exchanges
   */
  draw() {
    this.view.hideModal();
    this.view.showSpinner();

    // call API with activity object and wait for a filtered activity object
    this.model.getActivity((activity) => {
      (async () => {
        const response = await ky.post(
          'https://elegantupr-api.herokuapp.com/filter', {json: activity}
        );
        const filteredActivity = await response.json();

        // show chart with filtered activity
        this.view.hideSpinner();
        this.view.showChart(filteredActivity);
      })();
    });
  }

  /**
   * Reset and prepare the view for a new file upload
   */
  reset() {
    this.view.hideModal();
    this.view.hideChart();
    this.view.showUpload();
  }

}

},{"form-data":1,"ky/umd":2}],5:[function(require,module,exports){
module.exports = class Model {

  constructor() {
    /**
		 * @type {object}
		 */
    let store;
  }

  /**
	 * Get stored activity
	 *
	 * @param {function(object)} callback Called when activity is returned
	 */
  getActivity(callback) {
    const activity = this.store;

    callback(activity);
  }
  /**
   * Store activity
   *
   * @param {object} activity Activity to store
   */
  setActivity(activity) {
    this.store = activity;
  }

}

},{}],6:[function(require,module,exports){
/**
 * Render exchanges to list items
 *
 * @param {Array} exchanges Array of exchanges to render
 * @param {Element} element Parent list element
 */
function renderExchanges(exchanges, element) {
  exchanges.forEach(({amount, unit_name, name}) => {
    element.insertAdjacentHTML('beforeend', `
      <li>${amount.toFixed(4)} ${unit_name} ${name}</li>
    `);
  });
}

/**
 * Remove exchanges from parent list
 *
 * @param {Element} element Parent list element
 */
function clearExchanges(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

module.exports = class View {

  constructor() {
    // select all behavior classes
    this.$spinner = document.querySelector('.js-spinner');
    this.$drop = document.querySelector('.js-drop');
    this.$upload = document.querySelector('.js-upload');
    this.$modal = document.querySelector('.js-modal');
    this.$activity = document.querySelectorAll('.js-activity');
    this.$reset = document.querySelectorAll('.js-reset');
    this.$draw = document.querySelector('.js-draw');
    this.$chart = document.querySelector('.js-chart');
    this.$fromTechnosphere = document.querySelector('.js-from-technosphere');
    this.$toTechnosphere = document.querySelector('.js-to-technosphere');
    this.$fromEnvironment = document.querySelector('.js-from-environment');
    this.$toEnvironment = document.querySelector('.js-to-environment');
  }

  /**
	 * Show the spinner
	 */
  showSpinner() {
    this.$spinner.classList.remove('is-hidden');
  }

  /**
	 * Hide the spinner
	 */
  hideSpinner() {
    this.$spinner.classList.add('is-hidden');
  }

  /**
   * Show drop area for upload
   */
  showUpload() {
    this.$drop.reset();
    this.$drop.classList.remove('is-hidden');
  }

  /**
   * Hide drop area for upload
   */
  hideUpload() {
    this.$drop.classList.add('is-hidden');
  }

  /**
   * Show modal with the name and the geography shortname of the activity
   *
   * @param {object} activity Activity to show in modal
   */
  showModal({name, geography_shortname}) {
    this.$activity.forEach(($activity) => {
      $activity.textContent = `${name}, ${geography_shortname}`
    });

    this.$modal.classList.remove('is-hidden');
  }

  /**
   * Hide modal
   */
  hideModal() {
    this.$modal.classList.add('is-hidden');
  }

  /**
   * Show chart of activity with reference and by-products on the right, inputs
   * from technosphere on the left, emissions to environment on the top and
   * inputs from environment on the bottom
   *
   * @param {object} activity Activity to base the chart on
   */
  showChart({exchanges}) {
    renderExchanges(exchanges.from_technosphere, this.$fromTechnosphere);
    renderExchanges(exchanges.reference_product, this.$toTechnosphere);
    renderExchanges(exchanges.by_products, this.$toTechnosphere);
    renderExchanges(exchanges.to_environment, this.$toEnvironment);
    renderExchanges(exchanges.from_environment, this.$fromEnvironment);

    this.$chart.classList.remove('is-hidden');
  }

  /**
   * Hide chart
   */
  hideChart() {
    clearExchanges(this.$fromTechnosphere);
    clearExchanges(this.$toTechnosphere);
    clearExchanges(this.$toEnvironment);
    clearExchanges(this.$fromEnvironment);

    this.$chart.classList.add('is-hidden');
  }

  /**
	 * @param {Function} handler Function called on synthetic event
	 */
  bindUpload(handler) {
    this.$upload.addEventListener('change', (event) => {
      handler(this.$upload.files[0]);
    });
  }

  /**
   * @param {Function} handler Function called on synthetic event
   */
  bindDraw(handler) {
    this.$draw.addEventListener('click', (event) => {
      handler();
    });
  }

  /**
   * @param {Function} handler Function called on synthetic event
   */
  bindReset(handler) {
    this.$reset.forEach(($reset) => {
      $reset.addEventListener('click', (event) => {
        handler();
      });
    });
  }

}

},{}]},{},[3]);

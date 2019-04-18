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

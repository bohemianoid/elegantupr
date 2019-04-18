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
        'https://elegantupr-api.herokuapp.com/parser',
        {
          body: form,
          timeout: 30000
        }
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
          'https://elegantupr-api.herokuapp.com/filter',
          {
            json: activity,
            timeout: 30000
          }
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

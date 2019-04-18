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

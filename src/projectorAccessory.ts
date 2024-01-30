import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { EvolvePlatform } from './platform';

import { TuyaContext } from '@tuya/tuya-connector-nodejs';


interface CloudState {
  switch_led: boolean;
  initialized: boolean;
  populated: boolean;
  // include other properties as needed
}

export class EvolveProjectorAccessory {

  // Variables. Add to config?
  private device;

  private cloud_state: CloudState = {
    switch_led: false,
    initialized: false,
    populated: false,
    // include other properties as needed
  };

  private tuya = new TuyaContext({
    baseUrl: this.platform.config.cloud_credentials.tuya_region,
    accessKey: this.platform.config.cloud_credentials.tuya_access_key,
    secretKey: this.platform.config.cloud_credentials.tuya_secret_key,
  });

  // Service declarations. See createServices() for initialization.
  private powerSwitchService?:Service;

  // other services go here

  constructor (
    private readonly platform: EvolvePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    this.initDevice();

  }

  private async initDevice() {
    this.platform.log.debug('Initializing device...');
    this.device = await this.getDeviceDetails();
    await this.createServices();
    await this.setDeviceCharacteristics();
    await this.refreshCloudState();
    // this.platform.log.debug('Context here: ', this.accessory.context);
  }

  private async createServices() {
    // Get or create services
    this.powerSwitchService = this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch);
    // and more

    // powerSwitchService
    this.powerSwitchService.setCharacteristic(this.platform.Characteristic.Name, this.accessory.displayName);
    this.powerSwitchService.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))                // SET - bind to the `setOn` method below
      .onGet(this.getOn.bind(this));               // GET - bind to the `getOn` method below
  }

  /**
   * Retrieves the basic details of the device from the Tuya cloud.
   * @returns {Promise<any>} A promise that resolves with the device details.
   */
  private async getDeviceDetails() {
    this.platform.log.debug('Fetching device details for <Device ID: ', this.accessory.context.device.TuyaDeviceId);
    try {
      const device = await this.tuya.device.detail({
        device_id: this.accessory.context.device.TuyaDeviceId,
      });
      // this.platform.log.debug('Device Details: ', device);
      this.cloud_state.initialized = true;
      this.platform.log.debug('Device initialized!');
      return device;
      // this.platform.log.debug('Initial cloud state: ', JSON.stringify(this.cloud_state));
    } catch (error) {
      this.platform.log.error('Failed to initialize device:', error);
    }
  }

  private async setDeviceCharacteristics() {
    // set accessory information
    // Add these to config with default values? We'll have to see where these show up, if anywhere.
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, this.accessory.context.device.Manufacturer)
      .setCharacteristic(this.platform.Characteristic.Model, this.accessory.context.device.Model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.context.device.SerialNumber);
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */

  /**
   * Sets the value of the 'On' characteristic.
   * @param value - The new value for the 'On' characteristic.
   * @returns A promise that resolves when the value is successfully set.
   */
  async setOn(value: CharacteristicValue) {
    // implement your own code to turn your device on/off
    this.platform.log.debug('Set Characteristic On ->', value);
    if (!this.cloud_state.initialized) {
      this.platform.log.debug('Device is not initialized yet. Cannot set new status.');
    } else if (!this.cloud_state.populated) {
      this.platform.log.debug('State is not populated yet. Cannot set new status.');
    } else {
      await this.updateCloudState('switch_led', value as boolean);
    }
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.
   *
   * Ohhhh, I think you call updateCharacteristic instead of returning a value, if it's gonna be a minute

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */



  /**
   * Retrieves the value of the 'On' characteristic from the local cloud state.
   * @returns A promise that resolves to the value of the 'On' characteristic.
   */
  async getOn(): Promise<CharacteristicValue> {
    this.platform.log.debug('HomeKit requesting \'On\' characteristic...');
    // this.platform.log.debug('Current cloud \'On\' state: ', JSON.stringify(this.cloud_state.switch_led));
    let isOn = false;
    if (!this.cloud_state.initialized) {
      this.platform.log.debug('Device is not initialized yet. Cannot get characteristic.');
    } else if (!this.cloud_state.populated) {
      this.platform.log.debug('State is not populated yet. Cannot get characteristic.');
    } else {
      isOn = this.cloud_state.switch_led as boolean;
      this.platform.log.debug('Get Characteristic On ->', isOn);
    }
    return isOn;
  }


  // if you need to return an error to show the device as "Not Responding" in the Home app:
  // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);




  /**
   * Refreshes the cloud state of the device.
   * If the device is not initialized, it logs a debug message and does nothing.
   * Otherwise, it sends a request to the Tuya cloud to fetch the status of the device.
   * The response from the Tuya cloud is processed and the cloud state is updated accordingly.
   */
  async refreshCloudState() {
    if (!this.cloud_state.initialized) {
      this.platform.log.debug('Device is not initialized yet. Cannot refresh status.');
    } else {
      this.platform.log.debug(`Refreshing status of <Device ID: ${this.device.result.id}> from Tuya cloud...`);
      await this.tuya.request({
        path: `/v1.0/devices/${this.device.result.id}/status`,
        method: 'GET',
        query: {},
      }).then(async (response) => {
      // this.platform.log.debug('Tuya response (response): ', JSON.stringify(response));
        let resultObject: { [key: string]: string } = {};

        if (Array.isArray(response.result)) {
          resultObject = response.result.reduce((obj, item) => {
          // Ensure that 'item' has 'code' and 'value' properties
            if (typeof item === 'object' && item !== null && 'code' in item && 'value' in item) {
              obj[item.code] = item.value;
            }
            return obj;
          }, {});
        } else {
        // Handle the error appropriately
          this.platform.log.error('Tuya response (response.result) is not an array!');
          this.platform.log.error(String(response.result));
        }
        const new_state = Object.assign({}, this.cloud_state, resultObject);
        this.cloud_state = new_state;
        // this.cloud_state = resultObject as CloudState;
        this.cloud_state.populated = true;
        this.platform.log.debug('Local cloud state refreshed.');
      });
    }
  }

  /**
   * Updates the cloud state of the device by sending a command to the Tuya cloud.
   * @param {string} code - The code of the command to be sent. Usually describes a property of the device, like a switch or a color.
   * @param {boolean | string | number} new_value - The new value for the command. Make sure to use the correct type.
   * They're declared above in the interface
   * @returns {Promise<void>} - A promise that resolves when the cloud state is successfully updated.
   */
  async updateCloudState(code: string, new_value: boolean | string | number): Promise<void> {
    this.platform.log.debug('Pushing new state to Tuya cloud...');
    await this.tuya.request({
      path: `/v1.0/devices/${this.device.result.id}/commands`,
      method: 'POST',
      query: {},
      body: {
        'commands':[
          {
            'code': code,
            'value': new_value,
          },
        ],
      },
    }).then(async (response) => {
      this.platform.log.debug('Response successful: ', String(response.success));
      if (response.result === true) {
        // this.platform.log.debug('Successfully pushed new state to Tuya cloud!');
        this.platform.log.debug('Polling to validate new remote state...');
        for (let i = 0; i < this.platform.config.advanced_settings.max_api_retries; i++) {
          this.platform.log.debug('Attempt #' + String(i + 1));
          await this.refreshCloudState();
          if (this.cloud_state[code] === new_value) {
            this.platform.log.debug('New state successfully polled!');
            return;
          }
          // Wait for a short period of time before the next attempt
          await new Promise(resolve => setTimeout(resolve, this.platform.config.advanced_settings.polling_interval));
        }
        this.platform.log.error('Failed to update after ' + this.platform.config.advanced_settings.max_api_retries + ' attempts');
      } else {
        this.platform.log.error('Failed to push new state to Tuya cloud!');
      }
    });
  }
}




export { PlatformAccessory };
// get the LightBulb service if it exists, otherwise create a new LightBulb service
// you can create multiple services for each accessory
// this.powerSwitchService = this.accessory.getService(this.platform.Service.Switch) ||
//   this.accessory.addService(this.platform.Service.Switch);

// set the service name, this is what is displayed as the default name on the Home app
// in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
// this.powerSwitchService.setCharacteristic(this.platform.Characteristic.Name, this.accessory.displayName);

// each service must implement at-minimum the "required characteristics" for the given service type
// see https://developers.homebridge.io/#/service/Lightbulb

// // register handlers for the On/Off Characteristic
// this.powerSwitchService.getCharacteristic(this.platform.Characteristic.On)
//   .onSet(this.setOn.bind(this))                // SET - bind to the `setOn` method below
//   .onGet(this.getOn.bind(this));               // GET - bind to the `getOn` method below

// // register handlers for the Brightness Characteristic
// this.powerSwitchService.getCharacteristic(this.platform.Characteristic.Brightness)
//   .onSet(this.setBrightness.bind(this));       // SET - bind to the 'setBrightness` method below

/**
     * Creating multiple services of the same type.
     *
     * To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
     * when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
     * this.accessory.getService('NAME') || this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE_ID');
     *
     * The USER_DEFINED_SUBTYPE must be unique to the platform accessory (if you platform exposes multiple accessories, each accessory
     * can use the same sub type id.)
     */

// Example: add two "motion sensor" services to the accessory
// const motionSensorOneService = this.accessory.getService('Motion Sensor One Name') ||
//   this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor One Name', 'YourUniqueIdentifier-1');

// const motionSensorTwoService = this.accessory.getService('Motion Sensor Two Name') ||
//   this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor Two Name', 'YourUniqueIdentifier-2');

/**
     * Updating characteristics values asynchronously.
     *
     * Example showing how to update the state of a Characteristic asynchronously instead
     * of using the `on('get')` handlers.
     * Here we change update the motion sensor trigger states on and off every 10 seconds
     * the `updateCharacteristic` method.
     *
     */
// let motionDetected = false;
// setInterval(() => {
//   // EXAMPLE - inverse the trigger
//   motionDetected = !motionDetected;

//   // push the new value to HomeKit
//   motionSensorOneService.updateCharacteristic(this.platform.Characteristic.MotionDetected, motionDetected);
//   motionSensorTwoService.updateCharacteristic(this.platform.Characteristic.MotionDetected, !motionDetected);

//   this.platform.log.debug('Triggering motionSensorOneService:', motionDetected);
//   this.platform.log.debug('Triggering motionSensorTwoService:', !motionDetected);
// }, 10000);
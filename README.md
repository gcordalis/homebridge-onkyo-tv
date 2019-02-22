# homebridge-onkyo-tv

`homebridge-onkyo-tv` is a plugin for HomeBridge which allows you to control your Onkyo Receiver! It should work with most recent Onkyo Receivers (2016+) however it has only been tested with the TX-NR575E.
This provides native HomeKit control to the Onkyo Receiver.

### Features

- HomeKit TV integration
- Power status
- Turn On / Off
- Input Selection

### Coming Soon

- Volume Control
- Mute / Unmute

**NOTE:** This module only works with iOS 12.2 and later. iOS 12.2 is currently in beta and some features/functionality may change.

## Installation

If you are new to Homebridge, please first read the Homebridge [documentation](https://www.npmjs.com/package/homebridge).

Install homebridge:

```sh
sudo npm install -g homebridge
```

Install homebridge-webos-tv:

```sh
sudo npm install -g homebridge-onkyo-tv
```

## Configuration

Add the accessory in `config.json` in your home directory inside `.homebridge`.

Example configuration:

```js
{
  "accessories": [
    {
      "accessory": "tvservice-onkyo",
      "name": "TX-NR575E",
      "ip": "10.0.0.132",
      "volumeLimit": 75
    }
  ]
}
```

var Service, Characteristic, VolumeCharacteristic;
var eiscp = require("eiscp");

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory(
    "homebridge-tvservice-onkyo",
    "tvservice-onkyo",
    onkyoAccessory
  );
};

function onkyoAccessory(log, config) {
  // Variables received from config.json
  this.name = config["name"];
  this.host = config["ip"];
  this.volumeLimit = config["volumeLimit"] || 100;

  // Set variables
  this.log = log;
  this.connected = false;
  this.muteState = false;
  this.powerState = false;
  this.tvVolume = 0;
  this.currentInput = "";
  this.remoteControlButtons = ["MENU", "BACK", "VOLUMEUP", "VOLUMEDOWN"];

  var that = this;
  this.services = [];

  // Preset variables for eiscp module
  // Setting verify_commands to false allows the module to send raw commands as is to the receiver regardless of if the command is supported
  // host forces the module to connect to a specific receiver
  this.eiscpConfig = {
    verify_commands: false,
    host: this.host
  };

  this.service = new Service.Television(this.name, "service");
  this.service.setCharacteristic(Characteristic.ConfiguredName, this.name);
  this.services.push(this.service);

  this.inputService = new Service.InputSource(this.name);

  this.speakerService = new Service.TelevisionSpeaker(
    this.name + " Volume",
    "volumeService"
  );

  this.speakerService
    .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
    .setCharacteristic(
      Characteristic.VolumeControlType,
      Characteristic.VolumeControlType.ABSOLUTE
    );

  this.speakerService
    .getCharacteristic(Characteristic.VolumeSelector)
    .on("set", function(code, callback) {
      callback(false);
    });

  this.services.push(this.speakerService);

  // All inputs for the Onkyo TX-NR575E
  this.defaultInputs = [
    {
      code: "SLI11",
      name: "STRM BOX",
      type: Characteristic.InputSourceType.HDMI
    },
    {
      code: "SLI01",
      name: "CBL / SAT",
      type: Characteristic.InputSourceType.HDMI
    },
    {
      code: "SLI02",
      name: "GAME",
      type: Characteristic.InputSourceType.HDMI
    },
    {
      code: "SLI03",
      name: "AUX",
      type: Characteristic.InputSourceType.HDMI
    },
    {
      code: "SLI05",
      name: "PC",
      type: Characteristic.InputSourceType.HDMI
    },
    {
      code: "SLI10",
      name: "BD / DVD",
      type: Characteristic.InputSourceType.HDMI
    },
    {
      code: "SLI22",
      name: "PHONO",
      type: Characteristic.InputSourceType.AUDIO_SYSTEM
    },
    {
      code: "SLI23",
      name: "CD",
      type: Characteristic.InputSourceType.AUDIO_SYSTEM
    },
    {
      code: "SLI24",
      name: "FM Radio",
      type: Characteristic.InputSourceType.TUNER
    },
    {
      code: "SLI25",
      name: "AM Radio",
      type: Characteristic.InputSourceType.TUNER
    },
    {
      code: "SLI29",
      name: "USB",
      type: Characteristic.InputSourceType.USB
    },
    {
      code: "SLI2B",
      name: "NETWORK",
      type: Characteristic.InputSourceType.AIRPLAY
    }
  ];

  this.inputAppIds = new Array();

  this.defaultInputs.forEach((value, i) => {
    let tmpDefaultSource = new Service.InputSource(
      value.name,
      "inputSource" + i
    );
    tmpDefaultSource
      .setCharacteristic(Characteristic.Identifier, i)
      .setCharacteristic(Characteristic.ConfiguredName, value.name)
      .setCharacteristic(
        Characteristic.IsConfigured,
        Characteristic.IsConfigured.CONFIGURED
      )
      .setCharacteristic(Characteristic.InputSourceType, value.type)
      .setCharacteristic(
        Characteristic.CurrentVisibilityState,
        Characteristic.CurrentVisibilityState.SHOWN
      );

    this.service.addLinkedService(tmpDefaultSource);
    this.services.push(tmpDefaultSource);
    this.inputAppIds.push(value.code);
  });

  this.service
    .getCharacteristic(Characteristic.ActiveIdentifier)
    .on("set", (code, callback) => {
      if (this.connected) {
        this.log("onkyo - Input Source", this.inputAppIds[code]);
        eiscp.raw(this.inputAppIds[code], data => {
          this.currentInput = this.inputAppIds[code];
        });
        callback();
      } else {
        callback(null, false);
      }
    })
    .on("get", callback => {
      if (this.connected) {
        eiscp.raw("SLIQSTN", data => {
          for (input in this.defaultInputs) {
            if (this.defaultInputs[input].code === data.iscp_command) {
              this.currentInput = this.defaultInputs[input].code;
            }
          }
          callback(null, this.currentInput);
        });
      } else if (!this.currentInput === "") {
        callback(null, this.currentInput);
      } else {
        callback(null, false);
      }
    });

  this.prepareInformationService();

  this.service
    .getCharacteristic(Characteristic.Active)
    .on("get", this.getPowerState.bind(this))
    .on("set", this.setPowerState.bind(this));

  eiscp.connect(this.eiscpConfig);
  eiscp.on("connect", data => {
    log("Onkyo - Connected to", data);
    this.connected = true;
    eiscp.raw("PWRQSTN");
    eiscp.raw("SLIQSTN");
    eiscp.raw("MVLQSTN");
    // eiscp.raw("AMTQSTN", data => {});
  });

  eiscp.on("close", () => {
    log("Onkyo - Connection Closed");
    this.connected = false;
  });

  eiscp.on("data", data => {
    if (Array.isArray(data.command)) {
      var command = data.command[0];
    } else {
      var { command } = data;
    }

    switch (command) {
      case "system-power":
        if (data.argument === "on") {
          that.powerState = true;
        } else {
          that.powerState = false;
        }
        log("Power state -", data.argument);
        break;
      case "master-volume":
        that.tvVolume = data.argument;
        log("Volume state -", data.argument);
        break;
      case "audio-muting":
        if (data.argument === "on") {
          that.muteState = true;
        } else {
          that.muteState = false;
        }
        log("Mute state -", data.argument);
        break;
      case "input-selector":
        for (input in this.defaultInputs) {
          if (this.defaultInputs[input].code === data.iscp_command) {
            this.currentInput = this.defaultInputs[input].code;
          }
        }
        log("Input State -", this.currentInput);
        this.setCurrentInput;
        break;
    }
  });

  this.service
    .getCharacteristic(Characteristic.RemoteKey)
    .on("set", function(newValue, callback) {
      switch (newValue) {
        case 4:
          eiscp.raw("OSDUP");
          log("Onkyo - remote control service - UP");
          break;
        case 5:
          eiscp.raw("OSDDOWN");
          log("Onkyo - remote control service - DOWN");
          break;
        case 6:
          eiscp.raw("OSDLEFT");
          log("Onkyo - remote control service - LEFT");
          break;
        case 7:
          eiscp.raw("OSDRIGHT");
          log("Onkyo - remote control service - RIGHT");
          break;
        case 8:
          eiscp.raw("OSDENTER");
          log("Onkyo - remote control service - ENTER");
          break;
        case 9:
          eiscp.raw("OSDEXIT");
          log("Onkyo - remote control service - EXIT");
          break;
        case 10:
          eiscp.raw("OSDMENU");
          button = "INFO BUTTON"; // INFO BUTTON
          log(button);
          break;
        case 11:
          eiscp.raw("OSDMENU");
          button = "PLAY/PAUSE"; // PLAY/PAUSE
          log(button);
          break;
      }

      callback(null);
    });
}
// SETUP SERICES

onkyoAccessory.prototype.prepareInformationService = function() {
  this.informationService = new Service.AccessoryInformation();
  this.informationService
    .setCharacteristic(Characteristic.Manufacturer, "Onkyo")
    .setCharacteristic(Characteristic.Model, this.name)
    .setCharacteristic(Characteristic.SerialNumber, "123-456-789")
    .setCharacteristic(Characteristic.FirmwareRevision, "0.0.1");

  this.services.push(this.informationService);
};

onkyoAccessory.prototype.prepareTvSpeakerService = function() {
  this.tvSpeakerService = new Service.TelevisionSpeaker(
    this.name + " Volume",
    "tvSpeakerService"
  );
  this.tvSpeakerService
    .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
    .setCharacteristic(
      Characteristic.VolumeControlType,
      Characteristic.VolumeControlType.ABSOLUTE
    );
  this.tvSpeakerService
    .getCharacteristic(Characteristic.VolumeSelector)
    .on("set", (state, callback) => {
      this.log.debug(
        "Onkyo - volume change over the remote control (VolumeSelector), pressed: %s",
        state === 1 ? "Down" : "Up"
      );
      this.setVolumeSwitch(state, callback, !state);
    });
  this.tvSpeakerService
    .getCharacteristic(Characteristic.Mute)
    .on("get", this.getMuteState.bind(this))
    .on("set", this.setMuteState.bind(this));
  this.tvSpeakerService
    .addCharacteristic(Characteristic.Volume)
    .on("get", this.getVolume.bind(this))
    .on("set", this.setVolume.bind(this));

  this.services.push(this.tvSpeakerService);
};

onkyoAccessory.prototype.prepareRemoteControlButtonService = function() {
  if (
    this.remoteControlButtons == undefined ||
    this.remoteControlButtons == null ||
    this.remoteControlButtons.length <= 0
  ) {
    return;
  }

  if (Array.isArray(this.remoteControlButtons) == false) {
    this.remoteControlButtons = [this.remoteControlButtons];
  }

  this.remoteControlButtonService = new Array();
  this.remoteControlButtons.forEach((value, i) => {
    this.remoteControlButtons[i] = this.remoteControlButtons[i]
      .toString()
      .toUpperCase();
    let tmpRemoteControl = new Service.Switch(
      this.name + " RC: " + value,
      "remoteControlButtonService" + i
    );
    tmpRemoteControl
      .getCharacteristic(Characteristic.On)
      .on("get", callback => {
        this.getRemoteControlButtonState(
          callback,
          this.remoteControlButtons[i]
        );
      })
      .on("set", (state, callback) => {
        this.setRemoteControlButtonState(
          state,
          callback,
          this.remoteControlButtons[i]
        );
      });

    this.services.push(tmpRemoteControl);
    // this.remoteControlButtonService.push(tmpRemoteControl);
  });
};

// POWER

onkyoAccessory.prototype.getPowerState = function(callback) {
  callback(null, this.powerState);
};

onkyoAccessory.prototype.setPowerState = function(state, callback) {
  if (state) {
    eiscp.raw("PWR01");
    this.log.debug("Onkyo - power service - turned on", this.powerState);
    callback();
  } else {
    if (this.powerState) {
      eiscp.raw("PWR00");
      this.log.debug("Onkyo - power service - turned off", this.powerState);
      this.powerState = false;
    }
    callback();
  }
};

// MUTE

onkyoAccessory.prototype.getMuteState = function(callback) {
  callback(null, this.muteState);
};

onkyoAccessory.prototype.setMuteState = function(state, callback) {
  if (state) {
    eiscp.raw("AMTTG");
    this.log.debug("Onkyo - mute service - toggle", this.powerState);
    callback();
  }
};

// VOLUME

onkyoAccessory.prototype.getVolume = function(callback) {
  callback(null, this.tvVolume);
};

onkyoAccessory.prototype.setVolume = function(level, callback) {
  if (this.powerState) {
    this.log.debug(
      "Onkyo - volume service - setting volume to %s, limit: %s",
      level,
      this.volumeLimit
    );
    if (level > this.volumeLimit) {
      level = this.volumeLimit;
    }
    eiscp.raw("MVL" + level);
    callback();
  } else {
    callback(new Error("Onkyo - is not powered on, cannot set volume"));
  }
};

onkyoAccessory.prototype.getVolumeSwitch = function(callback) {
  callback(null, false);
};

onkyoAccessory.prototype.setVolumeSwitch = function(state, callback, isUp) {
  if (this.connected) {
    this.log.debug(
      "Onkyo - volume service - volume %s pressed, current volume: %s, limit: %s",
      isUp ? "Up" : "Down",
      this.tvVolume,
      this.volumeLimit
    );
    let volLevel = this.tvVolume;
    if (isUp) {
      if (volLevel < this.volumeLimit) {
        eiscp.raw("MVLUP");
      }
    } else {
      eiscp.raw("MVLDOWN");
    }
    setTimeout(() => {
      if (this.volumeUpService)
        this.volumeUpService
          .getCharacteristic(Characteristic.On)
          .updateValue(false);
      if (this.volumeDownService)
        this.volumeDownService
          .getCharacteristic(Characteristic.On)
          .updateValue(false);
    }, 10);
    callback();
  } else {
    callback(
      new Error("Onkyo - volume service - is not connected, cannot set volume")
    );
  }
};

// RUN SERVICE

onkyoAccessory.prototype.getServices = function() {
  return this.services;
};

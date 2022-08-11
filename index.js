const express = require('express');
const app = express()
const port = process.env.PORT || 8080;
const path = require('path');
const Protocol = require('azure-iot-device-amqp').Amqp;
const Client = require('azure-iot-device').Client;
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');


app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));
app.use('/favicon.ico', express.static('favicon.ico'));

app.use(express.urlencoded({ extended: true }));

const connectionString = process.env.DEVICE_CONNECTION_STRING;
const pin = process.env.PIN;


if (!connectionString) {
    console.log('Configuration incomplete! Set the DEVICE_CONNECTION_STRING environment variables.');
    process.exit(-1);
}

if (!pin) {
    console.log('Configuration incomplete! Set the PIN environment variables.');
    process.exit(-1);
}

let deviceId = connectionString.split(";").filter((e) => e.startsWith("DeviceId="))[0].substring("DeviceId=".length);

let deviceConfig = {
    id: deviceId,
    location: "",
    verificationCode: ""
}

app.get('/', (req, res) => {
    state = { "complete": false }
    res.render("qr", { title: "QR", device: deviceConfig });
})

app.get('/status', (req, res) => {
    res.json(deviceConfig.verificationCode);
})

app.listen(port, async () => {
    console.log(`This app is listening at http://localhost:${port}`)
    let isConnected = !!await require('dns').promises.resolve('azure.com').catch(() => { });
    console.log("Connected to Internet: ", isConnected)
    if (!isConnected) {
        await setupCellular();
    }

    startIotHubClient();
    await startFullScreenApp();
    uploadLogs();
});

async function setupCellular() {
    try {
        let commands = [
            "sudo qmicli -d /dev/cdc-wdm0 --dms-set-operating-mode='online'",
            'sudo ip link set wwan0 down',
            'echo Y | sudo tee /sys/class/net/wwan0/qmi/raw_ip',
            'sudo ip link set wwan0 up',
            'sudo qmicli --device=/dev/cdc-wdm0 --uim-verify-pin=PIN1,' + pin,
            'sudo qmicli --device=/dev/cdc-wdm0 --device-open-proxy --wds-start-network="ip-type=4,apn=gprs.swisscom.ch" --client-no-release-cid',
        ]
        await execCommands(commands);
        await execDHCPCommand('sudo udhcpc -i wwan0')
    } catch (e) {
        console.error(e);
        sleep(2000);
        console.log("Retry Cellular Setup")
        await setupCellular();
    }

}

async function execCommands(commands) {
    for (let com of commands) {
        try {
            console.log("Exec: " + com);
            await execCommand(com)
        } catch (e) {
            sleep(1000);
            console.log(e)
            console.log("Retry: " + com);
            await execCommand(com)
        }
    }
}

async function execCommand(com) {
    let { stdout, stderr } = await exec(com)
    if (stderr) {
        console.log("Error: ", stderr)
        throw stderr;
    } else {
        console.log("Successful: ", stdout)
        return stdout;
    }
}

async function execDHCPCommand(com) {
    let { stdout, stderr } = await exec(com)
    if (stderr) {
        console.log("Err. Log: ", stderr)
    } else {
        console.log("Successful: ", stdout)
    }
}

function startIotHubClient() {
    let client = Client.fromConnectionString(connectionString, Protocol);
    client.open((error) => {
        if (error) {
            console.error(error);
        } else {
            console.log('client successfully connected to iot hub');

            client.getTwin((error, twin) => {
                if (error) {
                    console.error('could not get twin')
                } else {
                    console.log('twin created');
                    twin.on('properties.desired', (delta) => {
                        console.log('desired properties received:', JSON.stringify(delta));
                        deviceConfig.location = delta.mzr;
                        deviceConfig.verificationCode = delta.verificationCode
                    });
                }
            })

            client.onDeviceMethod('onHealthCheck', (request, response) => {
                console.log('received a request for onHealthCheck');
                response.send(200, { "result": true }, (err) => {
                    if (err) {
                        console.error('Unable to send method response: ' + err.toString());
                    } else {
                        console.log('response to onHealthCheck sent.');
                    }
                });
            });

            client.onDeviceMethod('onUploadLogs', (request, response) => {
                console.log('received a request for onUploadLogs');
                uploadLogs();
                response.send(200, { "result": true }, (err) => {
                    if (err) {
                        console.error('Unable to send method response: ' + err.toString());
                    } else {
                        console.log('response to onHealthCheck sent.');
                    }
                });
            });

            client.on('error', (error) => {
                console.error(error);
            });
        }
    });
}

async function startFullScreenApp() {
    let commands = [
        'chromium-browser --kiosk http://localhost:8080 --no-sandbox'
    ]
    await execCommands(commands);
}

function uploadLogs() {
    let filePath = "/home/armasuisse/logs/servicestart.log";
    let errorFilePath = "/home/armasuisse/logs/error.log";
    let client = Client.fromConnectionString(connectionString, Protocol);

    fs.stat(filePath, (err, fileStats) => {
        console.log("Upload file: ", filePath);
        if (err) {
            console.error('could not read file: ' + err.toString());
        } else {
            let fileStream = fs.createReadStream(filePath);
            client.uploadToBlob(Date.now() + '.log', fileStream, fileStats.size, function (err, result) {
                fileStream.destroy();
                if (err) {
                    console.error('error uploading file: ' + err.constructor.name + ': ' + err.message);
                } else {
                    console.log('Upload successful');
                }
            });
        }
    });

    fs.stat(errorFilePath, (err, fileStats) => {
        console.log("Upload Error file: ", errorFilePath);
        if (err) {
            console.error('could not read file: ' + err.toString());
        } else {
            let errorFileStream = fs.createReadStream(errorFilePath);
            client.uploadToBlob(Date.now() + '-error.log', errorFileStream, fileStats.size, function (err, result) {
                fileStream.destroy();
                if (err) {
                    console.error('error uploading file: ' + err.constructor.name + ': ' + err.message);
                } else {
                    console.log('Upload successful');
                }
            });
        }
    });
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
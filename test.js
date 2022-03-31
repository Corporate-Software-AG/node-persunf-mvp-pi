var Protocol = require('azure-iot-device-amqp').Amqp;
var Client = require('azure-iot-device').Client;

var connectionString = process.env.DEVICE_CONNECTION_STRING;
if (!connectionString) {
    console.log('Please set the DEVICE_CONNECTION_STRING environment variable.');
    process.exit(-1);
}
var client = Client.fromConnectionString(connectionString, Protocol);

client.open(function (err) {
    if (err) {
        console.error(err.toString());
    } else {
        console.log('client successfully connected to iot hub');
        client.on('error', function (err) {
            console.error(err.toString());
        });

        client.onDeviceMethod('onQrAcknowledged', function (request, response) {
            console.log(request.payload);
            var responsePayload = {
                message: 'message received'
            };

            response.send(200, responsePayload, function (err) {
                if (err) {
                    console.error('Unable to send method response: ' + err.toString());
                } else {
                    console.log('response to onQrAcknowledged sent.');
                }
            });
        });
    }
});

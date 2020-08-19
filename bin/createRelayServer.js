const Config = require('../config.js');
const connectionRelay = Config.relay; // { proxyHost: '127.0.0.1', proxyPort: 1081 }

const socks5 = require('../src/socks5');
const server = socks5.createServer({
	connectionRelay
});
const hdlUtil = require('../src/helpers/hdlUtil');

// start listening!
const port = hdlUtil.getDeepVal(Config, 'port');
server.listen(port);

server.on('handshake', function (socket) {
	console.log();
	console.log('------------------------------------------------------------');
	console.log('new socks5 client from %s:%d', socket.remoteAddress, socket.remotePort);
});

// When a reqest arrives for a remote destination
server.on('proxyConnect', function (info, destination) {
	console.log('connected to remote server at %s:%d', info.address, info.port);

	destination.on('data', function (data) {
		console.log(data.length);
	});
});

server.on('proxyData', function (data) {
	console.log(data.length);
});

// When an error occurs connecting to remote destination
server.on('proxyError', function (err) {
	console.error('unable to connect to remote server');
	console.error(err);
});

// When a proxy connection ends
server.on('proxyEnd', function (response, args) {
	console.log('socket closed with code %d', response);
	console.log(args);
	console.log();
});

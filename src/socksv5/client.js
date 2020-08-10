const net = require('net');
// normalizeConnectArgs = net._normalizeConnectArgs,
const normalizeConnectArgs = function (args) {
	return Array.prototype.slice.call(args)
}
const dns = require('dns');
const util = require('util');
const inherits = util.inherits;
const EventEmitter = require('events').EventEmitter;

const Parser = require('./client.parser');
const ipbytes = require('./utils').ipbytes;

const CMD = require('./constants').CMD;
const ATYP = require('./constants').ATYP;

function Client (options) {
	if (!(this instanceof Client)) {
		return new Client(options);
	}

	let self = this;
	EventEmitter.call(this);
	this._hadError = false;
	this._ready = false;
	this._sock = new net.Socket();
	this._sock.on('connect', function () {
		self._onConnect();
	}).on('error', function (err) {
		if (!self._hadError && !self._ready) {
			self._hadError = true;
			self.emit('error', err);
		}
	}).on('close', function (hadErr) {
		self.emit('close', self._hadError || hadErr);
	});

	this._parser = null;

	this._proxyaddr = options && options.proxyHost;
	this._proxyport = options && options.proxyPort;

	if (typeof this._proxyaddr !== 'string') {
		this._proxyaddr = 'localhost';
	} else if (typeof this._proxyport !== 'number') {
		this._proxyport = 1080;
	}

	this._dstaddr = null;
	this._dstport = null;
	this._localDNS = (options && typeof options.localDNS === 'boolean'
		? options.localDNS
		: true);
	this._strictLocalDNS = (options && typeof options.strictLocalDNS === 'boolean'
		? options.strictLocalDNS
		: true);
	this._auths = [];
	if (options && Array.isArray(options.auths)) {
		for ( let i = 0, len = options.auths.length; i < len; ++i) {
			this.useAuth(options.auths[i]);
		}
	}
}
inherits(Client, EventEmitter);

Client.prototype._onConnect = function () {
	let self = this;
	let parser = this._parser;
	let socket = this._sock;

	var auths = self._auths;
	let alen = auths.length;
	let authsbuf = new Buffer(2 + alen);
	authsbuf[0] = 0x05;
	authsbuf[1] = alen;
	for ( let a = 0, p = 2; a < alen; ++a, ++p ){
		authsbuf[p] = auths[a].METHOD;
	}
	socket.write(authsbuf);

	parser.on('method', function (method) {
		alen = auths.length;
		for ( let i = 0; i < alen; ++i ) {
			if (auths[i].METHOD === method) {
				auths[i].client(socket, function (result) {
					if (result === true) {
						parser.authed = true;
						parser.start();
						self._sendRequest();
					} else {
						self._hadError = true;
						if (util.isError(result)){
							self.emit('error', result);
						} else {
							let err = new Error('Authentication failed');
							err.code = 'EAUTHFAILED';
							self.emit('error', err);
						}
						socket.end();
					}
				});
				self._sock.resume();
				return;
			}
		}

		const err = new Error('Authentication method mismatch');
		err.code = 'EAUTHNOTSUPPORT';
		self._hadError = true;
		self.emit('error', err);
		socket.end();
	}).on('error', function (err) {
		self._hadError = true;
		self.emit('error', err);
		if (socket.writable) {
			socket.end();
		}
	}).on('reply', function (/* repInfo */) {
		self._ready = true;
		self.emit('connect', self._sock);
		self._sock.resume();
	});
};

Client.prototype._sendRequest = function () {
	const self = this;
	const iptype = net.isIP(this._dstaddr);

	let addrlen = (iptype === 0
		? Buffer.byteLength(self._dstaddr)
		// eslint-disable-next-line no-magic-numbers
		: (iptype === 4 ? 4 : 16)),
		// eslint-disable-next-line no-magic-numbers
		reqbuf = new Buffer(6 + (iptype === 0 ? 1 : 0) + addrlen);
	let p;
	reqbuf[0] = 0x05;
	reqbuf[1] = CMD.CONNECT;
	reqbuf[2] = 0x00;
	if (iptype > 0) {
		let addrbytes = ipbytes(self._dstaddr);
		// eslint-disable-next-line no-magic-numbers
		reqbuf[3] = (iptype === 4 ? ATYP.IPv4 : ATYP.IPv6);
		// eslint-disable-next-line no-magic-numbers
		p = 4;
		for ( let i = 0; i < addrlen; ++i, ++p) {
			reqbuf[p] = addrbytes[i];
		}
	} else {
		reqbuf[3] = ATYP.NAME;
		reqbuf[4] = addrlen;
		// eslint-disable-next-line no-magic-numbers
		reqbuf.write(self._dstaddr, 5, addrlen);
		// eslint-disable-next-line no-magic-numbers
		p = 5 + addrlen;
	}
	reqbuf.writeUInt16BE(self._dstport, p, true);

	self._sock.write(reqbuf);
};

Client.prototype.useAuth = function (auth) {
	if (typeof auth !== 'object'
		|| typeof auth.client !== 'function'
		|| auth.client.length !== 2) {
		throw new Error('Invalid authentication handler');
	// eslint-disable-next-line no-magic-numbers
	} else if (this._auths.length >= 255) {
		throw new Error('Too many authentication handlers (limited to 255).');
	}
	this._auths.push(auth);

	return this;
};

Client.prototype.connect = function (options, cb) {
	var self = this;

	if (this._auths.length === 0) {
		throw new Error('Missing client authentication method(s)');
	}
	if (typeof options !== 'object') {
		// Old API:
		// connect(port, [host], [cb])
		// connect(path, [cb]);
		const args = normalizeConnectArgs(arguments);
		return Client.prototype.connect.apply(this, args);
	}

	if (!options.port) {
		throw new Error('Can only connect to TCP hosts');
	}
	if (typeof cb === 'function') {
		this.once('connect', cb);
	}
	this._dstaddr = options.host || 'localhost';
	this._dstport = + Number(options.port);

	if (typeof options.localDNS === 'boolean') {
		this._localDNS = options.localDNS;
	}
	if (typeof options.strictLocalDNS === 'boolean') {
		this._strictLocalDNS = options.strictLocalDNS;
	}
	if (typeof options.proxyHost === 'string') {
		this._proxyhost = options.proxyHost;
	}
	if (typeof options.proxyPort === 'string') {
		this._proxyport = options.proxyPort;
	}

	if (this._parser) {
		this._parser.stop();
	}
	this._parser = new Parser(this._sock);

	this._hadError = this._ready = false;

	const realOptions = {
		host: this._proxyhost,
		port: this._proxyport,
		// eslint-disable-next-line sort-keys
		localAddress: options.localAddress // TODO: remove?
	};

	if (net.isIP(this._dstaddr) === 0 && this._localDNS) {
		dns.lookup(this._dstaddr, function (err, addr) {
			if (err && self._strictLocalDNS) {
				self._hadError = true;
				self.emit('error', err);
				self.emit('close', true);
				return;
			}
			if (addr) {
				self._dstaddr = addr;
			}
			self._sock.connect(realOptions);
		});
	} else {
		this._sock.connect(realOptions);
	}
	return this;
};

exports.Client = Client;
exports.connect = exports.createConnection = function () {
	var args = normalizeConnectArgs(arguments),
		client = new Client(args[0]);
	process.nextTick(function () {
		Client.prototype.connect.apply(client, args);
	});
	return client;
};

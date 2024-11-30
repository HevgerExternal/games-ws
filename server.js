console.clear();
// Vars
const getArgs = () =>
	process.argv.reduce((args, arg) => {
		// long arg
		if (arg.slice(0, 2) === "--") {
			const longArg = arg.split("=");
			const longArgFlag = longArg[0].slice(2);
			const longArgValue = longArg.length > 1 ? longArg[1] : true;
			args[longArgFlag] = longArgValue;
		}
		// flags
		else if (arg[0] === "-") {
			const flags = arg.slice(1).split("");
			flags.forEach((flag) => {
				args[flag] = true;
			});
		}
		return args;
	}, {});

const args = getArgs();

const sessions = require('./helpers/sessions'),
	enquiryClient = require('./helpers/enquiryClient'),
	enquiryServer = require('./helpers/enquiryServer'),
	clients = new Map(),
	{ r, g, b, w, c, m, y, k } = require('./helpers/consoleColors');
var WebSocketServer = require('ws').Server,
	WebSocketClient = require('ws'),
	socketServer = new WebSocketServer({ port: 3000 }),
	base = 'wss://dpg.evo-games.com';
console.log("Started server on " + 3000);

// Local WebSocket server
socketServer.on('connection', (socketServerConnection, req) => {
	var id = sessions.uuid();
	let params = Object.fromEntries(new URLSearchParams(req.url));
	var sessionid = params.EVOSESSIONID;
	var metadata = { id, sessionid };
	clients.set(socketServerConnection, metadata);
	console.log(`Url ${req.url}`);
	const userSession = clients.get(socketServerConnection);
	var url = base + req.url,
		socketClient = null,
		socketClientConnection = true;

	// Handle errors for socketServerConnection
	socketServerConnection.on('error', (err) => {
		console.error('WebSocket Server Error:', err.message);
		clients.delete(socketServerConnection);
	});

	socketServerConnection.on('close', () => {
		console.log('WebSocket Server Connection Closed:', userSession.id);
		clients.delete(socketServerConnection);
		if (socketClient) socketClient.close();
	});

	// Emulator WebSocket server     
	const connect = (url) => {
		socketClient = new WebSocketClient(base + url);

		// Handle WebSocket client errors
		socketClient.on('error', (err) => {
			console.error('WebSocket Client Error:', err.message);
			socketClientConnection = false;
		});

		socketClient.on('close', () => {
			console.log('WebSocket Client Connection Closed');
			socketClientConnection = false;
		});

		socketClient.addEventListener('message', function (message) {
			var data = JSON.parse(message.data);
			console.log(c('WebSocket Client Message'), message.data);
			let stateClient = enquiryClient.ClientMsg(data, userSession);
			socketServerConnection.send(stateClient);
		});

		socketServerConnection.on('message', (message) => {
			try {
				var data = JSON.parse(message);
				console.log(c('WebSocket Server Message, User session: ' + userSession.id), JSON.stringify(data));
				let stateServer = enquiryServer.ServerMsg(data, userSession);
				if (socketClient) {
					if (stateServer.entry === 'server') {
						socketServerConnection.send(stateServer.msg);
					} else if (stateServer.entry === 'client') {
						let timeout = socketClientConnection === true ? 1500 : 0;
						setTimeout(function () {
							socketClient.send(stateServer.msg);
						}, timeout);
					}
				}
			} catch (err) {
				console.error('Message Error:', err.message);
			}
		});
	};

	connect(req.url);
});

socketServer.on("close", () => {
	clients.delete(socketServer);
	if (socketClient) socketClient.close();
});
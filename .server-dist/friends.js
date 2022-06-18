"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _optionalChain(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; }/**
 * Friends chat-plugin database handler.
 * @author mia-pi-git
 */
// @ts-ignore in case it isn't installed

var _lib = require('../.lib-dist');
var _configloader = require('./config-loader');
var _path = require('path'); var path = _path;

/** Max friends per user */
 const MAX_FRIENDS = 100; exports.MAX_FRIENDS = MAX_FRIENDS;
/** Max friend requests. */
 const MAX_REQUESTS = 6; exports.MAX_REQUESTS = MAX_REQUESTS;
 const DEFAULT_FILE = `${__dirname}/../databases/friends.db`; exports.DEFAULT_FILE = DEFAULT_FILE;
const REQUEST_EXPIRY_TIME = 30 * 24 * 60 * 60 * 1000;
const PM_TIMEOUT = 30 * 60 * 1000;
























/** Like Chat.ErrorMessage, but made for the subprocess so we can throw errors to the user not using errorMessage
 * because errorMessage crashes when imported (plus we have to spawn dex, etc, all unnecessary - this is easier)
 */
 class FailureMessage extends Error {
	constructor(message) {
		super(message);
		this.name = 'FailureMessage';
		Error.captureStackTrace(this, FailureMessage);
	}
} exports.FailureMessage = FailureMessage;

 function sendPM(message, to, from = '&') {
	const senderID = toID(to);
	const receiverID = toID(from);
	const sendingUser = Users.get(senderID);
	const receivingUser = Users.get(receiverID);
	const fromIdentity = sendingUser ? sendingUser.getIdentity() : ` ${senderID}`;
	const toIdentity = receivingUser ? receivingUser.getIdentity() : ` ${receiverID}`;

	if (from === '&') {
		return _optionalChain([sendingUser, 'optionalAccess', _ => _.send, 'call', _2 => _2(`|pm|&|${toIdentity}|${message}`)]);
	}
	if (sendingUser) {
		sendingUser.send(`|pm|${fromIdentity}|${toIdentity}|${message}`);
	}
	if (receivingUser) {
		receivingUser.send(`|pm|${fromIdentity}|${toIdentity}|${message}`);
	}
} exports.sendPM = sendPM;

function canPM(sender, receiver) {
	if (!receiver || !receiver.settings.blockPMs) return true;
	if (receiver.settings.blockPMs === true) return sender.can('lock');
	if (receiver.settings.blockPMs === 'friends') return false;
	return Users.globalAuth.atLeast(sender, receiver.settings.blockPMs);
}

 class FriendsDatabase {
	
	constructor(file = exports.DEFAULT_FILE) {
		this.file = file === ':memory:' ? file : path.resolve(file);
	}
	async updateUserCache(user) {
		user.friends = new Set(); // we clear to account for users who may have been deleted
		const friends = await this.getFriends(user.id);
		for (const friend of friends) {
			user.friends.add(friend.userid);
		}
		return user.friends;
	}
	static setupDatabase(fileName) {
		const file = fileName || process.env.filename || exports.DEFAULT_FILE;
		const exists = _lib.FS.call(void 0, file).existsSync() || file === ':memory:';
		const database = new (require('better-sqlite3'))(file);
		if (!exists) {
			database.exec(_lib.FS.call(void 0, 'databases/schemas/friends.sql').readSync());
		} else {
			let val;
			try {
				val = database.prepare(`SELECT val FROM database_settings WHERE name = 'version'`).get().val;
			} catch (e2) {}
			const actualVersion = _lib.FS.call(void 0, `databases/migrations/friends`).readdirIfExistsSync().length;
			if (val === undefined) {
				// hasn't been set up before, write new version.
				database.exec(_lib.FS.call(void 0, 'databases/schemas/friends.sql').readSync());
			}
			if (typeof val === 'number' && val !== actualVersion) {
				throw new Error(`Friends DB is out of date, please migrate to latest version.`);
			}
		}
		database.exec(_lib.FS.call(void 0, `databases/schemas/friends-startup.sql`).readSync());

		for (const k in FUNCTIONS) {
			database.function(k, FUNCTIONS[k]);
		}

		for (const k in ACTIONS) {
			try {
				statements[k] = database.prepare(ACTIONS[k ]);
			} catch (e) {
				throw new Error(`Friends DB statement crashed: ${ACTIONS[k ]} (${e.message})`);
			}
		}

		for (const k in TRANSACTIONS) {
			transactions[k] = database.transaction(TRANSACTIONS[k]);
		}

		statements.expire.run();
		return database;
	}
	async getFriends(userid) {
		return (await this.all('get', [userid, exports.MAX_FRIENDS])) || [];
	}
	async getRequests(user) {
		const sent = new Set();
		const received = new Set();
		if (user.settings.blockFriendRequests) {
			// delete any pending requests that may have been sent to them while offline
			// we used to return but we will not since you can send requests while blocking
			await this.run('deleteReceivedRequests', [user.id]);
		}
		const sentResults = await this.all('getSent', [user.id]);
		if (sentResults === null) return {sent, received};
		for (const request of sentResults) {
			sent.add(request.receiver);
		}
		const receivedResults = await this.all('getReceived', [user.id]);
		for (const request of receivedResults) {
			received.add(request.sender);
		}
		return {sent, received};
	}
	all(statement, data) {
		return this.query({type: 'all', data, statement});
	}
	transaction(statement, data) {
		return this.query({data, statement, type: 'transaction'});
	}
	run(statement, data) {
		return this.query({statement, data, type: 'run'});
	}
	get(statement, data) {
		return this.query({statement, data, type: 'get'});
	}
	 async query(input) {
		const process = exports.PM.acquire();
		if (!process || !_configloader.Config.usesqlite) {
			return {result: null};
		}
		const result = await process.query(input);
		if (result.error) {
			throw new Chat.ErrorMessage(result.error);
		}
		return result.result;
	}
	async request(user, receiverID) {
		const receiver = Users.getExact(receiverID);
		if (receiverID === user.id || _optionalChain([receiver, 'optionalAccess', _3 => _3.previousIDs, 'access', _4 => _4.includes, 'call', _5 => _5(user.id)])) {
			throw new Chat.ErrorMessage(`You can't friend yourself.`);
		}
		if (_optionalChain([receiver, 'optionalAccess', _6 => _6.settings, 'access', _7 => _7.blockFriendRequests])) {
			throw new Chat.ErrorMessage(`${receiver.name} is blocking friend requests.`);
		}
		let buf = _lib.Utils.html`/uhtml sent-${user.id},<button class="button" name="send" value="/friends accept ${user.id}">Accept</button> | `;
		buf += _lib.Utils.html`<button class="button" name="send" value="/friends reject ${user.id}">Deny</button><br /> `;
		buf += `<small>(You can also stop this user from sending you friend requests with <code>/ignore</code>)</small>`;
		const disclaimer = (
			`/raw <small>Note: If this request is accepted, your friend will be notified when you come online, ` +
			`and you will be notified when they do, unless you opt out of receiving them.</small>`
		);
		if (_optionalChain([receiver, 'optionalAccess', _8 => _8.settings, 'access', _9 => _9.blockFriendRequests])) {
			throw new Chat.ErrorMessage(`This user is blocking friend requests.`);
		}
		if (!canPM(user, receiver)) {
			throw new Chat.ErrorMessage(`This user is blocking PMs, and cannot be friended right now.`);
		}

		const result = await this.transaction('send', [user.id, receiverID]);
		if (receiver) {
			sendPM(`/raw <span class="username">${user.name}</span> sent you a friend request!`, receiver.id);
			sendPM(buf, receiver.id);
			sendPM(disclaimer, receiver.id);
		}
		sendPM(
			`/nonotify You sent a friend request to ${_optionalChain([receiver, 'optionalAccess', _10 => _10.connected]) ? receiver.name : receiverID}!`,
			user.name
		);
		sendPM(
			`/uhtml undo-${receiverID},<button class="button" name="send" value="/friends undorequest ${_lib.Utils.escapeHTML(receiverID)}">` +
			`<i class="fa fa-undo"></i> Undo</button>`, user.name
		);
		sendPM(disclaimer, user.id);
		return result;
	}
	async removeRequest(receiverID, senderID) {
		if (!senderID) throw new Chat.ErrorMessage(`Invalid sender username.`);
		if (!receiverID) throw new Chat.ErrorMessage(`Invalid receiver username.`);

		return this.run('deleteRequest', [senderID, receiverID]);
	}
	async approveRequest(receiverID, senderID) {
		return this.transaction('accept', [senderID, receiverID]);
	}
	async removeFriend(userid, friendID) {
		if (!friendID || !userid) throw new Chat.ErrorMessage(`Invalid usernames supplied.`);

		const result = await this.run('delete', {user1: userid, user2: friendID});
		if (result.changes < 1) {
			throw new Chat.ErrorMessage(`You do not have ${friendID} friended.`);
		}
	}
	writeLogin(user) {
		return this.run('login', [user, Date.now(), Date.now()]);
	}
	hideLoginData(id) {
		return this.run('hideLogin', [id, Date.now()]);
	}
	allowLoginData(id) {
		return this.run('showLogin', [id]);
	}
	async getLastLogin(userid) {
		const result = await this.get('checkLastLogin', [userid]);
		return parseInt(_optionalChain([result, 'optionalAccess', _11 => _11['last_login']])) || null;
	}
	async getSettings(userid) {
		return (await this.get('getSettings', [userid])) || {};
	}
	setHideList(userid, setting) {
		const num = setting ? 1 : 0;
		// name, send_login_data, last_login, public_list
		return this.run('toggleList', [userid, num, num]);
	}
} exports.FriendsDatabase = FriendsDatabase;

const statements = {};
const transactions = {};

const ACTIONS = {
	add: (
		`REPLACE INTO friends (user1, user2) VALUES ($user1, $user2) ON CONFLICT (user1, user2) ` +
		`DO UPDATE SET user1 = $user1, user2 = $user2`
	),
	get: (
		`SELECT * FROM friends_simplified f LEFT JOIN friend_settings fs ON f.friend = fs.userid WHERE f.userid = ? LIMIT ?`
	),
	delete: `DELETE FROM friends WHERE (user1 = $user1 AND user2 = $user2) OR (user1 = $user2 AND user2 = $user1)`,
	getSent: `SELECT receiver, sender FROM friend_requests WHERE sender = ?`,
	getReceived: `SELECT receiver, sender FROM friend_requests WHERE receiver = ?`,
	insertRequest: `INSERT INTO friend_requests(sender, receiver, sent_at) VALUES (?, ?, ?)`,
	deleteRequest: `DELETE FROM friend_requests WHERE sender = ? AND receiver = ?`,
	deleteReceivedRequests: `DELETE FROM friend_requests WHERE receiver = ?`,
	findFriendship: `SELECT * FROM friends WHERE (user1 = $user1 AND user2 = $user2) OR (user2 = $user1 AND user1 = $user2)`,
	findRequest: (
		`SELECT count(*) as num FROM friend_requests WHERE ` +
		`(sender = $user1 AND receiver = $user2) OR (sender = $user2 AND receiver = $user1)`
	),
	countRequests: `SELECT count(*) as num FROM friend_requests WHERE (sender = ? OR receiver = ?)`,
	login: (
		`INSERT INTO friend_settings (userid, send_login_data, last_login, public_list) VALUES (?, 0, ?, 0) ` +
		`ON CONFLICT (userid) DO UPDATE SET last_login = ?`
	),
	checkLastLogin: `SELECT last_login FROM friend_settings WHERE userid = ?`,
	deleteLogin: `UPDATE friend_settings SET last_login = 0 WHERE userid = ?`,
	expire: (
		`DELETE FROM friend_requests WHERE EXISTS` +
		`(SELECT sent_at FROM friend_requests WHERE should_expire(sent_at) = 1)`
	),
	hideLogin: ( // this works since if the insert works, they have no data, which means no public_list
		`INSERT INTO friend_settings (userid, send_login_data, last_login, public_list) VALUES (?, 1, ?, 0) ` +
		`ON CONFLICT (userid) DO UPDATE SET send_login_data = 1`
	),
	showLogin: `DELETE FROM friend_settings WHERE userid = ? AND send_login_data = 1`,
	countFriends: `SELECT count(*) as num FROM friends WHERE (user1 = ? OR user2 = ?)`,
	getSettings: `SELECT * FROM friend_settings WHERE userid = ?`,
	toggleList: (
		`INSERT INTO friend_settings (userid, send_login_data, last_login, public_list) VALUES (?, 0, 0, ?) ` +
		`ON CONFLICT (userid) DO UPDATE SET public_list = ?`
	),
};

const FUNCTIONS = {
	'should_expire': (sentTime) => {
		if (Date.now() - sentTime > REQUEST_EXPIRY_TIME) return 1;
		return 0;
	},
};

const TRANSACTIONS = {
	send: requests => {
		for (const request of requests) {
			const [senderID, receiverID] = request;
			const hasSentRequest = statements.findRequest.get({user1: senderID, user2: receiverID})['num'];
			const friends = statements.countFriends.get(senderID, senderID)['num'];
			const totalRequests = statements.countRequests.get(senderID, senderID)['num'];
			if (friends >= exports.MAX_FRIENDS) {
				throw new FailureMessage(`You are at the maximum number of friends.`);
			}
			const existingFriendship = statements.findFriendship.all({user1: senderID, user2: receiverID});
			if (existingFriendship.length) {
				throw new FailureMessage(`You are already friends with '${receiverID}'.`);
			}
			if (hasSentRequest) {
				throw new FailureMessage(`You have already sent a friend request to '${receiverID}'.`);
			}
			if (totalRequests >= exports.MAX_REQUESTS) {
				throw new FailureMessage(
					`You already have ${exports.MAX_REQUESTS} outgoing friend requests. Use "/friends view sent" to see your outgoing requests.`
				);
			}
			statements.insertRequest.run(senderID, receiverID, Date.now());
		}
		return {result: []};
	},
	add: requests => {
		for (const request of requests) {
			const [senderID, receiverID] = request;
			statements.add.run({user1: senderID, user2: receiverID});
		}
		return {result: []};
	},
	accept: requests => {
		for (const request of requests) {
			const [senderID, receiverID] = request;
			const friends = statements.get.all(receiverID, 101);
			if (_optionalChain([friends, 'optionalAccess', _12 => _12.length]) >= exports.MAX_FRIENDS) {
				throw new FailureMessage(`You are at the maximum number of friends.`);
			}
			const {result} = TRANSACTIONS.removeRequest([request]);
			if (!result.length) throw new FailureMessage(`You have no request pending from ${senderID}.`);
			TRANSACTIONS.add([request]);
		}
		return {result: []};
	},
	removeRequest: requests => {
		const result = [];
		for (const request of requests) {
			const [to, from] = request;
			const {changes} = statements.deleteRequest.run(to, from);
			if (changes) result.push(changes);
		}
		return {result};
	},
};

 const PM = new _lib.ProcessManager.QueryProcessManager(module, query => {
	const {type, statement, data} = query;
	const start = Date.now();
	const result = {};
	try {
		switch (type) {
		case 'run':
			result.result = statements[statement].run(data);
			break;
		case 'get':
			result.result = statements[statement].get(data);
			break;
		case 'transaction':
			result.result = transactions[statement]([data]);
			break;
		case 'all':
			result.result = statements[statement].all(data);
			break;
		}
	} catch (e) {
		if (!e.name.endsWith('FailureMessage')) {
			result.error = "Sorry! The database process crashed. We've been notified and will fix this.";
			Monitor.crashlog(e, "A friends database process", query);
		} else {
			result.error = e.message;
		}
		return result;
	}
	const delta = Date.now() - start;
	if (delta > 1000) {
		Monitor.slow(`[Slow friends list query] ${JSON.stringify(query)}`);
	}
	return result;
}, PM_TIMEOUT, message => {
	if (message.startsWith('SLOW\n')) {
		Monitor.slow(message.slice(5));
	}
}); exports.PM = PM;

if (!exports.PM.isParentProcess) {
	global.Config = (require )('./config-loader').Config;
	if (_configloader.Config.usesqlite) {
		FriendsDatabase.setupDatabase();
	}
	global.Monitor = {
		crashlog(error, source = 'A friends database process', details = null) {
			const repr = JSON.stringify([error.name, error.message, source, details]);
			process.send(`THROW\n@!!@${repr}\n${error.stack}`);
		},
		slow(message) {
			process.send(`CALLBACK\nSLOW\n${message}`);
		},
	};
	process.on('uncaughtException', err => {
		if (_configloader.Config.crashguard) {
			Monitor.crashlog(err, 'A friends child process');
		}
	});
	// eslint-disable-next-line no-eval
	_lib.Repl.start(`friends-${process.pid}`, cmd => eval(cmd));
} else {
	exports.PM.spawn(_configloader.Config.friendsprocesses || 1);
}

 //# sourceMappingURL=sourceMaps/friends.js.map
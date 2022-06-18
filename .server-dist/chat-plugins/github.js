"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _optionalChain(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; } function _optionalChainDelete(ops) { const result = _optionalChain(ops); return result == null ? true : result; } var _class;/**
 * Chat plugin to view GitHub events in a chatroom.
 * By Mia, with design / html from xfix's original bot, https://github.com/xfix/GitHub-Bot-Legacy/
 * @author mia-pi-git
 */

var _lib = require('../../.lib-dist');

const STAFF_REPOS = Config.staffrepos || ['pokemon-showdown', 'pokemon-showdown-client', 'Pokemon-Showdown-Dex'];
const COOLDOWN = 10 * 60 * 1000;

 const gitData = JSON.parse(_lib.FS.call(void 0, "config/chat-plugins/github.json").readIfExistsSync() || "{}"); exports.gitData = gitData;











































 const GitHub = new (_class = class {
	 __init() {this.hook = null}
	__init2() {this.updates = Object.create(null)}
	constructor() {;_class.prototype.__init.call(this);_class.prototype.__init2.call(this);
		try {
			// config.github: https://github.com/nlf/node-github-hook#readme
			this.hook = (require('githubhook'))(Config.github);
		} catch (e) {}
		this.listen();
	}
	listen() {
		if (!this.hook) return;
		this.hook.listen();
		this.hook.on('push', (repo, ref, result) => this.handlePush(repo, ref, result));
		this.hook.on('pull_request', (repo, ref, result) => this.handlePull(repo, ref, result));
	}
	 getRepoName(repo) {
		switch (repo) {
		case 'pokemon-showdown':
			return 'server';
		case 'pokemon-showdown-client':
			return 'client';
		case 'Pokemon-Showdown-Dex':
			return 'dex';
		default:
			return repo.toLowerCase();
		}
	}
	handlePush(repo, ref, result) {
		const branch = _optionalChain([/[^/]+$/, 'access', _ => _.exec, 'call', _2 => _2(ref), 'optionalAccess', _3 => _3[0]]) || "";
		if (branch !== 'master') return;
		const messages = {
			staff: [],
			development: [],
		};
		for (const commit of result.commits) {
			const {message, url} = commit;
			const [shortMessage] = message.split('\n\n');
			const username = this.getUsername(commit.author.name);
			const repoName = this.getRepoName(repo);
			const id = commit.id.substring(0, 6);
			messages.development.push(
				_lib.Utils.html`[<span style="color:#FF00FF">${repoName}</span>] <a href="${url}" style="color:#606060">${id}</a> ${shortMessage} <span style="color:#909090">(${username})</span>`
			);
			messages.staff.push(_lib.Utils.html`[<span style="color:#FF00FF">${repoName}</span>] <a href="${url}">${shortMessage}</a> <span style="color:#909090">(${username})</span>`);
		}
		for (const k in messages) {
			this.report(k , repo, messages[k ]);
		}
	}
	handlePull(repo, ref, result) {
		if (this.isRateLimited(result.number)) return;
		if (this.isGitbanned(result)) return;
		const url = result.pull_request.html_url;
		const action = this.isValidAction(result.action);
		if (!action) return;
		const repoName = this.getRepoName(repo);
		const userName = this.getUsername(result.sender.login);
		const title = result.pull_request.title;
		let buf = _lib.Utils.html`[<span style="color:#FF00FF">${repoName}</span>] <span style="color:#909090">${userName}</span> `;
		buf += _lib.Utils.html`${action} <a href="${url}">PR#${result.number}</a>: ${title}`;
		this.report('development', repo, buf);
	}
	report(roomid, repo, messages) {
		if (!STAFF_REPOS.includes(repo) && roomid === 'staff') return;
		if (Array.isArray(messages)) messages = messages.join('<br />');
		_optionalChain([Rooms, 'access', _4 => _4.get, 'call', _5 => _5(roomid), 'optionalAccess', _6 => _6.add, 'call', _7 => _7(`|html|<div class="infobox">${messages}</div>`), 'access', _8 => _8.update, 'call', _9 => _9()]);
	}
	isGitbanned(result) {
		if (!exports.gitData.bans) return false;
		return exports.gitData.bans[result.sender.login] || exports.gitData.bans[result.pull_request.user.login];
	}
	isRateLimited(prNumber) {
		if (this.updates[prNumber]) {
			if (this.updates[prNumber] + COOLDOWN > Date.now()) return true;
			this.updates[prNumber] = Date.now();
			return false;
		}
		this.updates[prNumber] = Date.now();
		return false;
	}
	isValidAction(action) {
		if (action === 'synchronize') return 'updated';
		if (action === 'review_requested') {
			return 'requested a review for';
		}
		if (['ready_for_review', 'labeled', 'unlabeled', 'converted_to_draft'].includes(action)) {
			return null;
		}
		return action;
	}
	getUsername(name) {
		return _optionalChain([exports.gitData, 'access', _10 => _10.usernames, 'optionalAccess', _11 => _11[toID(name)]]) || name;
	}
	save() {
		_lib.FS.call(void 0, "config/chat-plugins/github.json").writeUpdate(() => JSON.stringify(exports.gitData));
	}
}, _class); exports.GitHub = GitHub;

 const commands = {
	gh: 'github',
	github: {
		''() {
			return this.parse('/help github');
		},
		ban(target, room, user) {
			room = this.requireRoom('development');
			this.checkCan('mute', null, room);
			const [username, reason] = _lib.Utils.splitFirst(target, ',').map(u => u.trim());
			if (!toID(target)) return this.parse(`/help github`);
			if (!toID(username)) return this.errorReply("Provide a username.");
			if (room.auth.has(toID(exports.GitHub.getUsername(username)))) {
				return this.errorReply("That user is Dev roomauth. If you need to do this, demote them and try again.");
			}
			if (!exports.gitData.bans) exports.gitData.bans = {};
			if (exports.gitData.bans[toID(username)]) {
				return this.errorReply(`${username} is already gitbanned.`);
			}
			exports.gitData.bans[toID(username)] = reason || " "; // to ensure it's truthy
			exports.GitHub.save();
			this.privateModAction(`${user.name} banned the GitHub user ${username} from having their GitHub actions reported to this server.`);
			this.modlog('GITHUB BAN', username, reason);
		},
		unban(target, room, user) {
			room = this.requireRoom('development');
			this.checkCan('mute', null, room);
			target = toID(target);
			if (!target) return this.parse('/help github');
			if (!_optionalChain([exports.gitData, 'access', _12 => _12.bans, 'optionalAccess', _13 => _13[target]])) return this.errorReply("That user is not gitbanned.");
			delete exports.gitData.bans[target];
			if (!Object.keys(exports.gitData.bans).length) delete exports.gitData.bans;
			exports.GitHub.save();
			this.privateModAction(`${user.name} allowed the GitHub user ${target} to have their GitHub actions reported to this server.`);
			this.modlog('GITHUB UNBAN', target);
		},
		bans() {
			const room = this.requireRoom('development');
			this.checkCan('mute', null, room);
			return this.parse('/j view-github-bans');
		},
		setname: 'addusername',
		addusername(target, room, user) {
			room = this.requireRoom('development');
			this.checkCan('mute', null, room);
			const [gitName, username] = _lib.Utils.splitFirst(target, ',').map(u => u.trim());
			if (!toID(gitName) || !toID(username)) return this.parse(`/help github`);
			if (!exports.gitData.usernames) exports.gitData.usernames = {};
			exports.gitData.usernames[toID(gitName)] = username;
			exports.GitHub.save();
			this.privateModAction(`${user.name} set ${gitName}'s name on reported GitHub actions to be ${username}.`);
			this.modlog('GITHUB SETNAME', null, `'${gitName}' to '${username}'`);
		},
		clearname: 'removeusername',
		removeusername(target, room, user) {
			room = this.requireRoom('development');
			this.checkCan('mute', null, room);
			target = toID(target);
			if (!target) return this.parse(`/help github`);
			const name = _optionalChain([exports.gitData, 'access', _14 => _14.usernames, 'optionalAccess', _15 => _15[target]]);
			if (!name) return this.errorReply(`${target} is not a GitHub username on our list.`);
			 _optionalChainDelete([exports.gitData, 'access', _16 => _16.usernames, 'optionalAccess', _17 => delete _17[target]]);
			if (!Object.keys(exports.gitData.usernames || {}).length) delete exports.gitData.usernames;
			exports.GitHub.save();
			this.privateModAction(`${user.name} removed ${target}'s name from the GitHub username list.`);
			this.modlog('GITHUB CLEARNAME', target, `from the name ${name}`);
		},
		names() {
			return this.parse('/j view-github-names');
		},
	},
	githubhelp: [
		`/github ban [username], [reason] - Bans a GitHub user from having their GitHub actions reported to Dev room. Requires: % @ # &`,
		`/github unban [username] - Unbans a GitHub user from having their GitHub actions reported to Dev room. Requires: % @ # &`,
		`/github bans - Lists all GitHub users that are currently gitbanned. Requires: % @ # &`,
		`/github setname [username], [name] - Sets a GitHub user's name on reported GitHub actions to be [name]. Requires: % @ # &`,
		`/github clearname [username] - Removes a GitHub user's name from the GitHub username list. Requires: % @ # &`,
		`/github names - Lists all GitHub usernames that are currently on our list.`,
	],
}; exports.commands = commands;

 const pages = {
	github: {
		bans(query, user) {
			const room = Rooms.get('development');
			if (!room) return this.errorReply("No Development room found.");
			this.checkCan('mute', null, room);
			if (!exports.gitData.bans) return this.errorReply("There are no gitbans at this time.");
			let buf = `<div class="pad"><h2>Current Gitbans:</h2><hr /><ol>`;
			for (const [username, reason] of Object.entries(exports.gitData.bans)) {
				buf += `<li><strong>${username}</strong> - ${reason.trim() || '(No reason found)'}</li>`;
			}
			buf += `</ol>`;
			return buf;
		},
		names() {
			if (!exports.gitData.usernames) return this.errorReply("There are no GitHub usernames in the list.");
			let buf = `<div class="pad"><h2>Current GitHub username mappings:</h2><hr /><ol>`;
			for (const [username, name] of Object.entries(exports.gitData.usernames)) {
				buf += `<li><strong>${username}</strong> - ${name}</li>`;
			}
			buf += `</ol>`;
			return buf;
		},
	},
}; exports.pages = pages;

 function destroy() {
	_optionalChain([exports.GitHub, 'access', _18 => _18.hook, 'optionalAccess', _19 => _19.server, 'access', _20 => _20.close, 'call', _21 => _21()]);
} exports.destroy = destroy;

 //# sourceMappingURL=sourceMaps/github.js.map
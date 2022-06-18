"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _optionalChain(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; }/**
 * Async worker thread wrapper around SQLite, written to improve concurrent performance.
 * @author mia-pi-git
 */
var _processmanager = require('./process-manager');

var _fs = require('./fs');

 const DB_NOT_FOUND = null; exports.DB_NOT_FOUND = DB_NOT_FOUND;









































function getModule() {
	try {
		return require('better-sqlite3') ;
	} catch (e) {
		return null;
	}
}

 class Statement {
	
	
	constructor(statement, db) {
		this.db = db;
		this.statement = statement;
	}
	run(data) {
		return this.db.run(this.statement, data);
	}
	all(data) {
		return this.db.all(this.statement, data);
	}
	get(data) {
		return this.db.get(this.statement, data);
	}
	toString() {
		return this.statement;
	}
	toJSON() {
		return this.statement;
	}
} exports.Statement = Statement;

 class SQLDatabaseManager extends _processmanager.QueryProcessManager {
	
	__init() {this.database = null}
	



	 __init2() {this.dbReady = false}
	
	constructor(module, options, onError) {
		super(module, query => {
			if (!this.dbReady) {
				this.setupDatabase();
			}
			try {
				switch (query.type) {
				case 'load-extension': {
					if (!this.database) return null;
					this.loadExtensionFile(query.data);
					return true;
				}
				case 'transaction': {
					const transaction = this.state.transactions.get(query.name);
					// !transaction covers db not existing, typically, but this is just to appease ts
					if (!transaction || !this.database) {
						return null;
					}
					const env = {
						db: this.database,
						statements: this.state.statements,
					};
					return transaction(query.data, env) || null;
				}
				case 'exec': {
					if (!this.database) return {changes: 0};
					this.database.exec(query.data);
					return true;
				}
				case 'get': {
					if (!this.database) {
						return null;
					}
					return this.extractStatement(query).get(query.data);
				}
				case 'run': {
					if (!this.database) {
						return null;
					}
					return this.extractStatement(query).run(query.data);
				}
				case 'all': {
					if (!this.database) {
						return null;
					}
					return this.extractStatement(query).all(query.data);
				}
				case 'prepare':
					if (!this.database) {
						return null;
					}
					this.state.statements.set(query.data, this.database.prepare(query.data));
					return query.data;
				}
			} catch (error) {
				return this.onError(error, query);
			}
		});SQLDatabaseManager.prototype.__init.call(this);SQLDatabaseManager.prototype.__init2.call(this);;

		this.options = options;
		this.onError = onError || ((err, query) => {
			if (_optionalChain([global, 'access', _ => _.Monitor, 'optionalAccess', _2 => _2.crashlog])) {
				Monitor.crashlog(err, `an ${this.basename} SQLite process`, query);
				return null;
			}
			throw new Error(`SQLite error: ${err.message} (${JSON.stringify(query)})`);
		});
		this.state = {
			transactions: new Map(),
			statements: new Map(),
		};
		if (!this.isParentProcess) this.setupDatabase();
	}
	 cacheStatement(source) {
		source = source.trim();
		let statement = this.state.statements.get(source);
		if (!statement) {
			statement = this.database.prepare(source);
			this.state.statements.set(source, statement);
		}
		return statement;
	}
	 extractStatement(
		query
	) {
		query.statement = query.statement.trim();
		const statement = query.noPrepare ?
			this.state.statements.get(query.statement) :
			this.cacheStatement(query.statement);
		if (!statement) throw new Error(`Missing cached statement "${query.statement}" where required`);
		return statement;
	}
	setupDatabase() {
		if (this.dbReady) return;
		this.dbReady = true;
		const {file, extension} = this.options;
		const Database = getModule();
		this.database = Database ? new Database(file) : null;
		if (extension) this.loadExtensionFile(extension);
	}

	loadExtensionFile(extension) {
		if (!this.database) return;
		const {
			functions,
			transactions: storedTransactions,
			statements: storedStatements,
			onDatabaseStart,
			// eslint-disable-next-line @typescript-eslint/no-var-requires
		} = require(`../${extension}`);
		if (functions) {
			for (const k in functions) {
				this.database.function(k, functions[k]);
			}
		}
		if (storedTransactions) {
			for (const t in storedTransactions) {
				const transaction = this.database.transaction(storedTransactions[t]);
				this.state.transactions.set(t, transaction);
			}
		}
		if (storedStatements) {
			for (const k in storedStatements) {
				const statement = this.database.prepare(storedStatements[k]);
				this.state.statements.set(statement.source, statement);
			}
		}
		if (onDatabaseStart) {
			onDatabaseStart(this.database);
		}
	}
	all(
		statement, data = [], noPrepare
	) {
		if (typeof statement !== 'string') statement = statement.toString();
		return this.query({type: 'all', statement, data, noPrepare});
	}
	get(
		statement, data = [], noPrepare
	) {
		if (typeof statement !== 'string') statement = statement.toString();
		return this.query({type: 'get', statement, data, noPrepare});
	}
	run(
		statement, data = [], noPrepare
	) {
		if (typeof statement !== 'string') statement = statement.toString();
		return this.query({type: 'run', statement, data, noPrepare});
	}
	transaction(name, data = []) {
		return this.query({type: 'transaction', name, data});
	}
	async prepare(statement) {
		const source = await this.query({type: 'prepare', data: statement});
		if (!source) return null;
		return new Statement(source, this);
	}
	exec(data) {
		return this.query({type: 'exec', data});
	}
	loadExtension(filepath) {
		return this.query({type: 'load-extension', data: filepath});
	}

	async runFile(file) {
		const contents = await _fs.FS.call(void 0, file).read();
		return this.query({type: 'exec', data: contents});
	}
} exports.SQLDatabaseManager = SQLDatabaseManager;






 function SQL(
	module, input
) {
	const {onError, processes} = input;
	for (const k of ['onError', 'processes'] ) delete input[k];
	const PM = new SQLDatabaseManager(module, input, onError);
	if (PM.isParentProcess) {
		if (processes) PM.spawn(processes);
	}
	return PM;
} exports.SQL = SQL;







 //# sourceMappingURL=sourceMaps/sql.js.map
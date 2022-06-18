"use strict";Object.defineProperty(exports, "__esModule", {value: true});/**
 * SQL transactions for the modlog.
 */




 const transactions = {
	insertion: (args, env) => {
		const modlogInsertion = env.statements.get(args.modlogInsertionStatement);
		const altsInsertion = env.statements.get(args.altsInsertionStatement);
		if (!modlogInsertion) {
			throw new Error(`Couldn't find prepared statement for provided value (args.modlogInsertionStatement=${args.modlogInsertionStatement}`);
		}
		if (!altsInsertion) {
			throw new Error(`Couldn't find prepared statement for provided value (args.altsInsertionStatement=${args.altsInsertionStatement}`);
		}

		for (const entry of args.entries) {
			// SQLite doesn't have a boolean type, so this is a workaround.
			entry.isGlobal = Number(entry.isGlobal) ;
			const result = modlogInsertion.run(entry);
			const rowid = result.lastInsertRowid ;

			for (const alt of entry.alts || []) {
				altsInsertion.run(rowid, alt);
			}
		}
	},
}; exports.transactions = transactions;

 //# sourceMappingURL=sourceMaps/transactions.js.map
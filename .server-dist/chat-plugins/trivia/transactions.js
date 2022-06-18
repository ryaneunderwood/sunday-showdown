"use strict";Object.defineProperty(exports, "__esModule", {value: true});/**
 * SQL transactions for the Trivia plugin.
 */




 const transactions = {
	addHistory: (
		args,
		env
	) => {
		const gameHistoryInsertion = env.statements.get(args.gameHistoryInsertion);
		const scoreHistoryInsertion = env.statements.get(args.scoreHistoryInsertion);
		if (!gameHistoryInsertion || !scoreHistoryInsertion) throw new Error('Statements not found');

		for (const game of args.history) {
			const {lastInsertRowid} = gameHistoryInsertion.run(
				game.mode, game.length, game.category, game.startTime, game.creator, Number(game.givesPoints)
			);
			for (const userid in game.scores) {
				scoreHistoryInsertion.run(lastInsertRowid, userid, game.scores[userid]);
			}
		}

		return true;
	},

	addQuestions: (
		args




,
		env
	) => {
		const questionInsertion = env.statements.get(args.questionInsertion);
		const answerInsertion = env.statements.get(args.answerInsertion);
		if (!questionInsertion || !answerInsertion) throw new Error('Statements not found');

		const isSubmissionForSQLite = Number(args.isSubmission);
		for (const question of args.questions) {
			const {lastInsertRowid} = questionInsertion.run(
				question.question, question.category, question.addedAt, question.user, isSubmissionForSQLite
			);
			for (const answer of question.answers) {
				answerInsertion.run(lastInsertRowid, answer);
			}
		}

		return true;
	},
}; exports.transactions = transactions;

 //# sourceMappingURL=sourceMaps/transactions.js.map
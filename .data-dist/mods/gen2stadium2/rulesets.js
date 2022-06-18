"use strict";Object.defineProperty(exports, "__esModule", {value: true}); const Rulesets = {
	standard: {
		effectType: 'ValidatorRule',
		name: 'Standard',
		ruleset: ['Obtainable', 'Team Preview', 'Stadium Sleep Clause', 'Freeze Clause Mod', 'Self-KO Clause', 'Species Clause', 'OHKO Clause', 'Evasion Moves Clause', 'Exact HP Mod', 'Cancel Mod', 'Stadium Items Clause'],
	},
	selfkoclause: {
		effectType: 'Rule',
		name: 'Self-KO Clause',
		desc: "If a player's last Pokemon uses Self-Destruct or Explosion, they automatically lose the battle.",
		onBegin() {
			this.add('rule', 'Self-KO Clause: If a player\'s last Pokemon uses Self-Destruct/Explosion, they automatically lose');
		},
	},
}; exports.Rulesets = Rulesets;

 //# sourceMappingURL=sourceMaps/rulesets.js.map
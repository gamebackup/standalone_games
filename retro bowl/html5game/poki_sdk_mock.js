// Retro Bowl Poki SDK mock
// The GameMaker build expects PokiSDK (injected by Poki's real host) to exist.
// Off Poki's platform we provide a no-op mock so nothing throws and the game
// continues normally after each ad break callback.

window.PokiSDK_OK = true;

const _resolved = (value) => Promise.resolve(value);

window.PokiSDK = {
	init: () => _resolved(),
	setDebug: () => {},
	error: () => {},
	displayAd: () => {},

	gameLoadingStart: () => {},
	gameLoadingProgress: (data) => { window.PokiSDK_loadState = 1; },
	gameLoadingFinished: () => { window.PokiSDK_loadState = 2; },

	gameplayStart: () => {},
	gameplayStop: () => {},

	happyTime: (magnitude) => {},

	commercialBreak: () => _resolved(undefined),
	rewardedBreak: () => _resolved({ rewardAmount: 1, rewardType: "coins" }),
	isCommercialBreakAllowed: () => _resolved(true),

	shareableURL: () => _resolved(""),
	evalScript: () => _resolved(undefined),

	addEventListener: (event, cb) => {},
	removeEventListener: (event, cb) => {},
	dispatchEvent: (event) => {},
};
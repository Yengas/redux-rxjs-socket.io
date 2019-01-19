const { Observable, from, of, NEVER } = require('rxjs');

function streamSwitchCase(switchMap, key, ...args){
	const mapper = switchMap[key];
	if(!mapper) return NEVER;

	const result = mapper.apply(this, args);

	if(Array.isArray(result) || result instanceof Promise){
		return from(result);
	}else if(result instanceof Observable){
		return result;
	}

	return of(result);
}

module.exports = {
	streamSwitchCase,
};

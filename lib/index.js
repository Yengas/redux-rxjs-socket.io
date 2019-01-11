const { Subject, Observable, merge, NEVER } = require('rxjs');
const { filter, mergeMap, withLatestFrom } = require('rxjs/operators');
const { streamSwitchCase } = require('./utils');
const SOCKET_REGISTER = Symbol('@@redux-rxjs-socket.io/register');
const SOCKET_UNREGISTER = Symbol('@@redux-rxjs-socket.io/unregister');

/**
 * JSDoc type definitions for action, state and event streams
 *
 * @typedef {{ type: string, payload: * }} Action a singular Redux action
 * @typedef {Observable<Action>} ActionStream stream of redux actions
 * @typedef {*} State the Redux application state
 * @typedef {Observable<State>} StateStream stream of Redux application state
 * @typedef {{ event: string, data?: * }} Event an event to be sent to the socket
 * @typedef {Observable<Event>} EventStream stream of events to emit to socket
 * @typedef {{ event: Symbol, data: * }} OutsideEvent custom types of events which are inject to socket event stream
 * @typedef {Observable<OutsideEvent>} OutsideEventStream stream of OutsideEvent
 */

/**
 * Mapper type definitions
 *
 * @typedef {(Action|Action[]|Observable<Action>)} ActionMapResult
 * @typedef {Object.<string, function(*?, *?): ActionMapResult>} EventToActionMapper
 * @typedef {(Event|Event[]|Observable<Event>)} EventMapResult
 * @typedef {Object.<string, function(*?, *?): EventMapResult>} ActionToEventMapper
 */

/**
 * Given a socket, some event listeners that listen to it to create an event$,
 * removes all registered listeners from the socket and completes the event$.
 *
 * @param socket
 * @param eventListeners
 * @param event$
 * @returns {Function}
 */
function createUnregisterFunction(socket, eventListeners, event$){
	return function unregister(){
		// remove each listener from the socket events
		Object.keys(eventListeners).forEach((event) => {
			const listenerFunc = eventListeners[event];
			socket.removeListener(event, listenerFunc);
		});
		// finish the action stream
		event$.complete();
	};
}

/**
 * Given a mapper of socket events to actions, returns a function that will create an action stream
 * when given a socket to get emitted values from, and optional game state and outside event streams.
 *
 * @param {EventToActionMapper} eventToActionMapper
 * @returns {function(*, StateStream?, OutsideEventStream?): ActionStream}
 */
const generateActionStreamCreator = (eventToActionMapper) => (socket, gameState$, outsideEvent$) => {
	const event$ = new Observable((event$) => {
		const eventListeners = Object.keys(eventToActionMapper).reduce((listeners, event) => {
			function listener(data){
				event$.next({ event, data });
			}

			// add the listener function to socket event as a listener
			socket.on(event, listener);
			listeners[event] = listener;
			return listeners;
		}, {});

		return createUnregisterFunction(socket, eventListeners, event$);
	});

	const events = Object.keys(eventToActionMapper);

	return merge(event$, outsideEvent$ || NEVER).pipe(
		filter(({ event }) => events.includes(event)),
		withLatestFrom(gameState$ || of(null)),
		mergeMap(([{ event, data }, state]) => streamSwitchCase(eventToActionMapper, event, data, state)),
	);
};

/**
 * Given an action to event mapper, returns a function which
 * given an redux action$, and state$ returns an event stream to emit to socket
 *
 * @param {ActionToEventMapper} actionToEventMapper
 * @returns {function(ActionStream, StateStream): EventStream}
 */
const generateEmitStreamCreator = (actionToEventMapper) => (gameAction$, gameState$) => {
	const actionTypes = Object.keys(actionToEventMapper);

	return gameAction$.pipe(
		filter(({ type }) => actionTypes.includes(type)),
		withLatestFrom(gameState$),
		mergeMap(([{ type, payload }, state]) => streamSwitchCase(actionToEventMapper, type, payload, state)),
	);
};

/**
 * Registers the given socket to the given redux store.
 *
 * @param {EventToActionMapper} eventToActionMapper
 * @param {ActionToEventMapper} actionToEventMapper
 * @param socket
 * @param action$
 * @param state$
 * @param storeDispatch
 * @returns {Observable<*>}
 */
function register(eventToActionMapper, actionToEventMapper, socket, action$, state$, storeDispatch){
	return new Observable(() => {
		const outsideEvent$ = new Subject();
		const action$ = generateActionStreamCreator(eventToActionMapper)(socket, state$, outsideEvent$);
		const emit$ = generateEmitStreamCreator(actionToEventMapper)(action$, state$);

		// send each action created by the socket events to the game store
		const actionSub = action$.subscribe(action => storeDispatch(action));
		// send each emit created by the game store to socket
		const emitSub = emit$.subscribe(({ event, data }) => socket.emit(event, data));

		// emit register event
		outsideEvent$.next({ event: SOCKET_REGISTER });

		return function unsubscribe(){
			// emit unregister action
			outsideEvent$.next({ event: SOCKET_UNREGISTER });
			outsideEvent$.complete();

			// stop listening to all events/actions
			emitSub.unsubscribe();
			actionSub.unsubscribe();
		}
	});
}

/**
 * Creates a register function with less arguments to call with.
 * @param {EventToActionMapper} eventToActionMapper
 * @param {ActionToEventMapper} actionToEventMapper
 * @returns {function(*, ActionStream, StateStream, *): Observable<void>}
 */
function registerCreator(eventToActionMapper, actionToEventMapper) {
	return (socket, action$, state$, storeDispatch) =>
		register(eventToActionMapper, actionToEventMapper, socket, action$, state$, storeDispatch);
}

module.exports = {
	generateActionStreamCreator,
	generateEmitStreamCreator,
	register,
	registerCreator,
	Symbols: {
		SOCKET_REGISTER,
		SOCKET_UNREGISTER,
	},
};

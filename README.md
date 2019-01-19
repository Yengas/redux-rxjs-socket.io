# redux-rxjs-socket.io
Helper functions to connect socket.io to redux, when using redux-observable.

## Mappers
This library lets you define mappers from socket events to redux actions, and redux actions to socket events. The mappers you define are maps, that return a function that may return a value/array or a stream.

### Event to Action Mappers
Below is a sample definition of socket to redux actions.
```javascript
{
    // custom event that is triggered if you use the #register method and socket is registered
    [RegisterHelper.Symbols.SOCKET_REGISTER]: () => actions.createSocketUserConnect(),
    // custom event that is triggered when the subscription is stopped
    [RegisterHelper.Symbols.SOCKET_UNREGISTER]: () => actions.createSocketDisconnect(),
    // some custom events with data, that are emitted by the client/server socket
    ping: ({ time }) => actions.createPingAction(time),
    // you can also use the latest game state, when creating actions, can return streams
    test: ({ key }, gameState) => from(promise).pipe(map(() => actions.createTestAction(key, gameState.blaBla))),
}
```

### Action to Emit Mappers
Below is a sample definition of mapping redux actions into emitted events.
```javascript
(mapperUserId) => ({
    // on some action, create an event
    [ActionTypes.UserConnected]: ({ userId }, state) => {
       return userId !== mapperUserId
           ? [ { event: 'other_user', data: { userId, leaderboard: state.leaderboard } } ]
           : [];
    },
})
```

## Methods
- *generateActionStreamCreator = (mapperDefinition) => (socket, state$, outsideEvent$)* given a mapper definition, returns a function, that will return a action stream when given a socket, state stream and an custom outsideEventStream. When the returned stream is unsubscribed, the event register events on sockets will be unregistered.
- *generateEmitStreamCreator = (mapperDefinition) => (action$, state$)* given a mapper definition, returns a function, that will return a event stream when given redux action stream and a redux state stream.
- *register = (eventToActionMapper, actionToEventMapper) => (socket, action$, state$, storeDispatch)* when given event and action mapper definitions, returns you a function that will register a socket to a redux store. You just need to give socket, action$, state$ and the store dispatch function.

import 'blueimp-md5/js/md5.js';
import 'platform/platform.js';
window.Kano = window.Kano || {}

export const Tracking = (config) => {
    /** Expire the session after 30 minutes of inactivity */
    const DEFAULT_SESSION_LENGTH = 30 * 60 * 1000,
          /** Process the queue every 5 seconds */
          DEFAULT_QUEUE_LENGTH = 5 * 1000,
          BROWSER_KEY = 'KANO-TRACKING-BROWSER-ID',
          SESSION_KEY = 'KANO-TRACKING-SESSION-ID',
          SCHEMA_KEY = 'KANO-TRACKING-SCHEMA',
          LOCATION_KEY = 'KANO-TRACKING-LOCATION';
    /**
     * The (hopefully) unique ID for the user's browser
     * @type {String}
     */
    let browserId,
        /**
         * The user's current kit serial number (Kano 2 app only
         * @type {String}
         */
        kitId,
        /**
         * The timestamp of the last event queued
         * @type {Date}
         */
        lastUpdate,
        /**
         * The user's location
         * @type {String}
         */
        location,
        /**
         * The user's device mode (Kano 2 app only)
         * @type {String}
         */
        mode,
        /**
         * The user's OS details
         * @type {Object}
         */
        os = {},
        /**
         * The current URL path
         * @type {String}
         */
        path,
        /**
         * If the session hasn't started, then we won't have all the
         * data available for the event. We can cache them in the
         * `preInitEvents` queue, and then process once the session
         * has started.
         * @type {Array}
         */
        preInitEvents = [],
        /**
         * Boolean flag to prevent the previous session data being
         * erased from `localStorage` – eg. on the Kano 2 App where we
         * want to preserve this when switching between the main app
         * and Kano Code.
         * @type {Boolean}
         */
        preserveSavedSession = config.PRESERVE_PREVIOUS_SESSION,
        /**
         * The user's device mode (Kano 2 app only)
         * @type {Boolean}
         */
        previousSession = false,
        /**
         * The queue of tracking events to be sent to the API
         * @type {Array}
         */
        queue = [],
        /**
         * The number of miliseconds to wait before dispatching the
         * current queue
         * @type {Number}
         */
        queueLength = config.QUEUE_LENGTH || DEFAULT_QUEUE_LENGTH,
        /**
         * The interval ID of the queue scheduler
         * @type {Number}
         */
        queueInterval,
        /**
         * The API schema to use for recording the events
         * @type {String}
         */
        schema,
        /**
         * The (hopefully) unique ID for the user's curent session
         * @type {String}
         */
        sessionId,
        /**
         * The number of miliseconds of inactivity before the session
         * is considered to have expired, and will be restarted if
         * another event occurs
         * @type {Number}
         */
        sessionLength = config.SESSION_LENGTH || DEFAULT_SESSION_LENGTH,
        /**
         * Whether the session has been started or not
         * @type {Boolean}
         */
        sessionStarted = false,
        /**
         * The user's timezone offset
         * @type {Number}
         */
        timezoneOffset,
        /**
         * The user's auth token
         * @type {String}
         */
        token;

    /**
     * Clear the interval for the queue scheduler and clear the queue
     */
    function _clearQueueDispatch () {
        window.clearInterval(queueInterval);
        _dispatchQueue();
    }
    function _decodeQueryParams (paramString) {
        let params = {};
        if (paramString[0] === '?') {
            paramString = paramString.slice(1);
        }
        /**
         * Work around a bug in decodeURIComponent where + is not
         * converted to spaces:
         */
        paramString = (paramString || '').replace(/\+/g, '%20');
        let paramList = paramString.split('&');
        paramList.forEach(param => {
            let keyValue = param.split('=');
            if (keyValue[0]) {
                params[decodeURIComponent(keyValue[0])] =
                decodeURIComponent(keyValue[1] || '');
            }
        });
        return params;
    }
    /** Dispatch the event queue to the API */
    function _dispatchQueue () {
        if (!queue.length) {
            return;
        }
        let headers = new Headers({
                'Content-Type': 'application/json'
            }),
            cache = queue;
        if (token) {
            headers.append('Authorization', token);
        }
        queue = [];
        fetch(`${config.API_URL}/track/${schema}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({events: cache})
        }).catch(err => {
            _log(err);
            /** If the request has failed, reinsert the failed queue */
            queue.splice(0, 0, cache);
        });
    }
    /**
     * Console.log the `item` if the debug option has been set
     * @param {String} item
     */
    function _log (item) {
        if (config.DEBUG) {
            console.log(item);
        }
    }
    /**
     * Allow the `browserId` to be accessed to allow the component using
     * the behavior or mixin to use this if required
     * @returns {String}
     */
    function _getBrowserId () {
        return browserId;
    }
    /**
     * Retrieve the user's current location from the Geo API
     * @returns {Promise}
     */
    function _getLocation () {
        return fetch(config.GEO_API)
            .then((response) => response.json())
            .then((response) => {
                return response.Country.Names.en;
            }).catch((error) => {
                return 'Unknown';
            });
    }
    /**
     * Allow the `sessionId` to be accessed to allow the component using
     * the behavior or mixin to use this if required
     * @returns {String}
     */
    function _getSessionId () {
        return sessionId;
    }
    /**
     * Send what's left of the queue using a synchronous XMLHttpRequest
     * to block transitions until the data has been sent.
     * TODO: A blocking XMLHttpRequest could be very poor for user
     * experience and should be carefully evaluated
     * `navigator.sendBeacon` would be a good alternative, but sending
     * JSON is currently blocked in Chrome due to CORS considerations
     * (see here: https://bugs.chromium.org/p/chromium/issues/detail?id=490015).
     * `sendBeacon` also does not allow custom headers such as
     * Authorization, so we could not send through tokens to identify
     * the user.
     */
    function _handleUnload () {
        window.removeEventListener('unload', _handleUnload);
        if (!queue.length) {
            return;
        }
        try {
            let client = new XMLHttpRequest(),
                url = `${config.API_URL}/track/${schema}`,
                body = JSON.stringify({events: queue});
            client.open('POST', url, false);
            client.setRequestHeader('Content-type', 'application/json');
            if (token) {
                client.setRequestHeader('Authorization', token);
            }
            client.send(body);
        } catch (e) {
            _log(e);
        }
        queue = [];
    }
    /**
     * Ensure that all the relevent information is set (including the
     * token if supplied) and start the session
     * @param {Event} e
     */
    function _initializeTracking (e) {
        /** If we've already started the session, then do nothing */
        if (sessionStarted) {
            return;
        }
        _setSchema();
        _setIds();
        _setOs();
        _setTimezoneOffset();
        if (e.detail.token) {
            _tokenChanged(e);
        }
        if (e.detail.path) {
            _trackPageView(e);
        }
        let storedLocation = localStorage.getItem(LOCATION_KEY);
        if (!storedLocation || storedLocation === 'Unknown') {
            _getLocation().then(response => {
                location = response;
                localStorage.setItem(LOCATION_KEY, location);
                _log('Tracking location set: ' + location);
                _startSession(preInitEvents);
                preInitEvents = [];
            });
        } else {
            location = storedLocation;
            _log('Tracking location set: ' + location);
            _startSession(preInitEvents);
            preInitEvents = [];
        }
    }
    /**
     * Format an event with the correct information and add to the queue
     * @param {Object} payload
     */
    function _queueEvent (payload) {
        let sessionExpired = _sessionExpired(lastUpdate);
        if (sessionExpired && sessionStarted) {
            return _restartSession([payload]);
        }
        let body = {
            app_id: config.APP_ID,
            app_version: config.VERSION,
            browser_id: browserId,
            page_path: path || '',
            session_id: sessionId,
            name: payload.name,
            os: os.name,
            os_version: os.version,
            time: parseInt(Date.now() / 1000),
            timezone_offset: timezoneOffset
        };
        if (kitId) {
            body.kitId = kitId;
        }
        if (mode) {
            body.mode = mode;
        }
        if (payload.data) {
            body.data = payload.data;
        }
        _log('Tracking event: ' + payload.name);
        _log(body);
        queue.push(body);
        lastUpdate = Date.now();
    }
    /**
     * Generate a new sessionId for the new session, and reset all
     * previous details
     * @param {Object} restartEvent An event to add to the queue after
     *                              restarting the session
     */
    function _restartSession (restartEvents) {
        let idString = window.navigator.userAgent + Date.now().toString(),
            hashedId = md5(idString);
        sessionId = hashedId;
        sessionStorage.setItem(SESSION_KEY, hashedId);
        sessionStarted = false;
        previousSession = false;
        _startSession(restartEvents);
    }
    /** Set an interval to dispatch the event queue */
    function _scheduleQueueDispatch () {
        queueInterval = window.setInterval(_dispatchQueue, queueLength);
    }
    /**
     * Set the schema - from the queryParams, localStorage
     * or the config
     */
    function _setSchema () {
        /**
         * When using Kano Code within the Electron app, we want to be
         * able to provide the app's schema in place of the default
         * schema
         */
        let params = _decodeQueryParams(window.location.search);
        schema = params[SCHEMA_KEY] ||
                 localStorage.getItem(SCHEMA_KEY) ||
                 config.TRACKING.SCHEMA;
        _log('Tracking schema set: ' + schema);
    }
    /** Set the unique browser and session IDs */
    function _setIds () {
        let params = _decodeQueryParams(window.location.search),
            previousSessionId = params[SESSION_KEY] ||
                                localStorage.getItem(SESSION_KEY),
            idString = window.navigator.userAgent +
                       Date.now().toString(),
            hashedId = md5(idString);

        browserId = params[BROWSER_KEY] ||
                    localStorage.getItem(BROWSER_KEY);
        sessionId = sessionStorage.getItem(SESSION_KEY);

        /**
         * If a `session-id` has been saved in localStorage or provided
         * in the params, then we want make use of this to continue the
         * session, and then clear `localStorage`
         */
        if (previousSessionId) {
            sessionId = previousSessionId;
            sessionStorage.setItem(SESSION_KEY, previousSessionId);
            if (!preserveSavedSession) {
                localStorage.removeItem(SESSION_KEY);
            }
            previousSession = true;
        } else if (!sessionId) {
            sessionId = hashedId;
            sessionStorage.setItem(SESSION_KEY, sessionId);
        }
        if (!browserId) {
            browserId = hashedId;
        }
        /**
         * Save the browser key to allow the ID supplied in the params
         * to override any existing ID
         */
        localStorage.setItem(BROWSER_KEY, browserId);
        _log('Tracking sessionId set: ' + sessionId);
        _log('Tracking browserId set: ' + browserId);
    }
    /**
     * Save a session so that this can be maintained across apps
     */
    function _saveSession () {
        localStorage.setItem(SESSION_KEY, sessionId);
    }
    /**
     * Save a schema so that this can be transferred between sessions
     * or apps
     */
    function _saveSchema () {
        localStorage.setItem(SCHEMA_KEY, schema);
    }
    /**
     * Check whether a session has expired
     * @returns {Boolean}
     */
    function _sessionExpired () {
        if (!lastUpdate) {
            return false;
        }
        let now = Date.now();
        return now - lastUpdate > sessionLength;
    }
    /** Set the user's OS details */
    function _setOs () {
        os = {
            name: platform.os.family,
            version: platform.os.version
        }
        _log('Tracking OS set: ' + JSON.stringify(os));
    }
    /** Set the user's timezoneOffset */
    function _setTimezoneOffset () {
        let now = new Date();
        timezoneOffset = now.getTimezoneOffset();
        _log('Tracking timezoneOffset set: ' + timezoneOffset);
    }
    /**
     * Queue a `started_session` event, as well as the event that
     * restarted it (if provided) and schedule the queue processing
     * @param {Object} startEvent
     */
    function _startSession (startEvents) {
        if (!previousSession) {
            _queueEvent({
                name: 'started_session',
                data: {
                    user_location: location
                }
            });
        }
        /**
         * If the session is being started with previous events, then
         * we need to put these into the main queue
         */
        if (startEvents && startEvents.length) {
            startEvents.forEach(startEvent => {
                _queueEvent(startEvent);
            });
        }
        sessionStarted = true;
        _scheduleQueueDispatch();
    }
    /**
     * Update the token and restart the session if it has been unset
     * @param {Event} e
     */
    function _tokenChanged (e) {
        let previous = token,
            current = e.detail.token;
        token = current;
        /**
         * If there was a previous session, but not a new one – ie. the
         * user has logged out – we want to trigger a new session
         */
        if (previous && !current) {
            _restartSession();
        }
    }
    /**
     * Track an event fired by the app
     * @param {Event} e
     */
    function _trackBasicEvent (e) {
        let name = e.detail.name,
            payload = {
                name
            };
        if (e.detail.data) {
            payload.data = e.detail.data;
        }
        if (e.detail.token) {
            payload.token = e.detail.token;
        }
        /**
         * If the session hasn't started, then we won't have all the
         * data available for the event. We can cache it in the
         * `preInitEvents` queue, and then process once the session
         * has started.
         */
        if (!sessionStarted) {
            return preInitEvents.push(payload);
        }
        _queueEvent(payload);
    }
    /**
     * Track a page view logged by the app
     * @param {Event} e
     */
    function _trackPageView (e) {
        /**
         * If the new page is the same as the current, then this is a
         * duplicate event and should be rejected.
         */
        if (path === e.detail.path) {
            return;
        }
        let previous = path,
            payload = {
                name: 'viewed_page'
            };
        path = e.detail.path;
        if (previous) {
            payload.data = {
                previous_page_path: previous
            }
        }
        /**
         * If the session hasn't started, then we won't have all the
         * data available for the event. We can cache it in the
         * `preInitEvents` queue, and then process once the session
         * has started.
         */
        if (!sessionStarted) {
            return preInitEvents.push(payload);
        }
        _queueEvent(payload);
    }
    /**
     * Track an error event
     * @param {Object} payload
     */
    function _trackError (payload) {
        if (!sessionStarted) {
            return preInitEvents.push(payload);
        }
        _queueEvent(payload);
    }
    /**
     * Respond to a user-initiated error
     * @param {Event} e The error event
     */
    function _trackUserError (e) {
        _trackError({
            name: 'user_error',
            data: {
                error_message: e.detail.message
            }
        });
    }
    /**
     * TODO: Check how this is being used
     * Respond to a system error
     * @param {String} msg
     * @param {String} url
     * @param {String} lineNo
     * @param {String} columnNo
     * @param {String} error
     */
    function _trackSystemError (msg, url, lineNo, columnNo, error) {
        let message = [
                'Message: ' + msg,
                'Path: ' + url,
                'Line: ' + lineNo,
                'Column: ' + columnNo
            ].join(' - ');
            _trackError({
                name: 'system_error',
                data: {
                    error_message: message
                }
            });
        return false;
    };
    /** The Polymer 1 behavior */
    const Behavior = {
        attached () {
            this._trackBasicEvent = _trackBasicEvent.bind(this);
            this._trackPageView = _trackPageView.bind(this);
            this._tokenChanged = _tokenChanged.bind(this);
            this._trackUserError = _trackUserError.bind(this);
            this._initializeTracking = _initializeTracking.bind(this);
            this._trackSystemError = _trackSystemError.bind(this);
            this._getBrowserId = _getBrowserId.bind(this);
            this._getSessionId = _getSessionId.bind(this);
            window.addEventListener('tracking-event', this._trackBasicEvent);
            window.addEventListener('page-view', this._trackPageView);
            window.addEventListener('token-changed', this._tokenChanged);
            window.addEventListener('error-event', this._trackUserError);
            window.addEventListener('initialize-tracking', this._initializeTracking);
            window.addEventListener('error', this._trackSystemError);
            window.addEventListener('beforeunload', this._handleUnload);
        },
        detached () {
            window.removeEventListener('tracking-event', this._trackBasicEvent);
            window.removeEventListener('page-view', this._trackPageView);
            window.removeEventListener('token-changed', this._tokenChanged);
            window.removeEventListener('error-event', this._trackUserError);
            window.removeEventListener('initialize-tracking', this._initializeTracking);
            window.removeEventListener('error', this._trackSystemError);
            window.removeEventListener('beforeunload', this._handleUnload);
            _clearQueueDispatch();
        },
        _handleUnload () {
            _handleUnload();
            window.removeEventListener('beforeunload', this._handleUnload);
        }
    };
    /** The Polymer 2 mixin */
    const Mixin = (parent) => {
        return class TrackingComponent extends parent {
            connectedCallback () {
                super.connectedCallback();
                window.addEventListener('tracking-event', _trackBasicEvent);
                window.addEventListener('page-view', _trackPageView);
                window.addEventListener('token-changed', _tokenChanged);
                window.addEventListener('error-event', _trackUserError);
                window.addEventListener('initialize-tracking', _initializeTracking);
                window.addEventListener('error', _trackSystemError);
                window.addEventListener('beforeunload', _handleUnload);
                this._getBrowserId = _getBrowserId.bind(this);
                this._getSessionId = _getSessionId.bind(this);
            }
            disconnectedCallback() {
                super.disconnectedCallback();
                window.removeEventListener('tracking-event', _trackBasicEvent);
                window.removeEventListener('page-view', _trackPageView);
                window.removeEventListener('token-changed', _tokenChanged);
                window.removeEventListener('error-event', _trackUserError);
                window.removeEventListener('initialize-tracking', _initializeTracking);
                window.removeEventListener('error', _trackSystemError);
                window.removeEventListener('beforeunload', _handleUnload);
                _clearQueueDispatch();
            }
        }
    };
    if (config.DEBUG) {
        return {
            queue,
            _clearQueueDispatch,
            _dispatchQueue,
            _getBrowserId,
            _getLocation,
            _getSessionId,
            _initializeTracking,
            _queueEvent,
            _restartSession,
            _scheduleQueueDispatch,
            _setIds,
            _setSchema,
            _sessionExpired,
            _setOs,
            _setTimezoneOffset,
            _startSession,
            _tokenChanged,
            _trackBasicEvent,
            _trackPageView,
            _trackError,
            _trackUserError,
            _trackSystemError,
            Behavior,
            Mixin
        }
    } else {
        return {
            Behavior,
            Mixin
        }
    }
};

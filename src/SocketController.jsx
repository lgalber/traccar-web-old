import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { devicesActions, messagesActions, sessionActions } from './store';
import { useCatchCallback, useAsyncTask } from './reactHelper';
import { snackBarDurationLongMs } from './common/util/duration';
import alarm from './resources/alarm.mp3';
import { eventsActions } from './store/events';
import useFeatures from './common/util/useFeatures';
import { useAttributePreference } from './common/util/preferences';
import {
  handleNativeNotificationListeners,
  nativePostMessage,
} from './common/components/NativeInterface';
import fetchOrThrow from './common/util/fetchOrThrow';

const logoutCode = 4000;

let alarmAudio;
const playAlarm = () => {
  if (!alarmAudio) {
    alarmAudio = new Audio(alarm);
  }
  alarmAudio.currentTime = 0;
  alarmAudio.play();
};

const SocketController = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const authenticated = useSelector((state) => Boolean(state.session.user));
  const includeLogs = useSelector((state) => state.session.includeLogs);

  const socketRef = useRef();
  const reconnectTimeoutRef = useRef();

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const soundEvents = useAttributePreference('soundEvents', '');
  const soundAlarms = useAttributePreference('soundAlarms', 'sos');

  const features = useFeatures();

  // Pending alerts (not yet marked as seen) are kept on the server. They are reloaded whenever the live
  // connection opens (start and every reconnect), when the app returns to the foreground and when a push
  // arrives or is tapped, because live events are missed while a phone has the app suspended.
  const loadPending = useCallback(async () => {
    if (features.disableEvents) {
      return;
    }
    try {
      const response = await fetch('api/events/unseen');
      if (response.ok) {
        dispatch(eventsActions.set(await response.json()));
      }
    } catch {
      // offline; the next reconnect or resume loads them
    }
  }, [features.disableEvents, dispatch]);

  const loadPendingRef = useRef(loadPending);
  loadPendingRef.current = loadPending;

  useEffect(() => {
    if (!authenticated || !('serviceWorker' in navigator)) return undefined;
    const onMessage = (event) => {
      if (event.data?.type === 'refresh-alerts') {
        loadPendingRef.current();
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [authenticated]);

  const handleEvents = useCallback(
    (events) => {
      if (!features.disableEvents) {
        dispatch(eventsActions.add(events));
      }
      if (
        events.some(
          (e) =>
            soundEvents.includes(e.type) ||
            (e.type === 'alarm' && soundAlarms.includes(e.attributes.alarm)),
        )
      ) {
        playAlarm();
      }
      events.forEach((event) => {
        if (event.attributes.message) {
          dispatch(
            messagesActions.push({
              message: event.attributes.message,
              severity: 'info',
              duration: snackBarDurationLongMs,
            }),
          );
        }
      });
    },
    [features, dispatch, soundEvents, soundAlarms],
  );

  const handleEventsRef = useRef(handleEvents);
  handleEventsRef.current = handleEvents;

  const includeLogsRef = useRef(includeLogs);
  includeLogsRef.current = includeLogs;

  const connectSocketRef = useRef();

  const connectSocket = useCallback(() => {
    clearReconnectTimeout();
    if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
      socketRef.current.close();
    }
    const url = new URL('api/socket', document.baseURI);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      dispatch(sessionActions.updateSocket(true));
      socket.send(JSON.stringify({ logs: includeLogsRef.current }));
      loadPendingRef.current();
    };

    socket.onclose = async (event) => {
      dispatch(sessionActions.updateSocket(false));
      if (event.code === logoutCode) return;
      try {
        const devicesResponse = await fetch('api/devices');
        if (socketRef.current !== socket) return;
        if (devicesResponse.ok) {
          dispatch(devicesActions.update(await devicesResponse.json()));
        }
        const positionsResponse = await fetch('api/positions');
        if (socketRef.current !== socket) return;
        if (positionsResponse.ok) {
          dispatch(sessionActions.updatePositions(await positionsResponse.json()));
        }
        if (devicesResponse.status === 401 || positionsResponse.status === 401) {
          navigate('/login');
        }
      } catch {
        // ignore errors
      }
      if (socketRef.current !== socket) return;
      clearReconnectTimeout();
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connectSocketRef.current?.();
      }, 60000);
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.devices) {
        dispatch(devicesActions.update(data.devices));
      }
      if (data.positions) {
        dispatch(sessionActions.updatePositions(data.positions));
      }
      if (data.events) {
        handleEventsRef.current(data.events);
      }
      if (data.logs) {
        dispatch(sessionActions.updateLogs(data.logs));
      }
    };
  }, [clearReconnectTimeout, dispatch, navigate]);

  connectSocketRef.current = connectSocket;

  useEffect(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ logs: includeLogs }));
    }
  }, [includeLogs]);

  useAsyncTask(
    async ({ signal }) => {
      if (authenticated) {
        const response = await fetchOrThrow('api/devices', { signal });
        dispatch(devicesActions.refresh(await response.json()));
        nativePostMessage('authenticated');
        connectSocket();
        return () => {
          clearReconnectTimeout();
          socketRef.current?.close(logoutCode);
        };
      }
      return null;
    },
    [authenticated, dispatch, clearReconnectTimeout, connectSocket],
  );

  const handleNativeNotification = useCatchCallback(
    async (message) => {
      const eventId = message.data.eventId;
      if (eventId) {
        const response = await fetch(`api/events/${eventId}`);
        if (response.ok) {
          const event = await response.json();
          const eventWithMessage = {
            ...event,
            attributes: { ...event.attributes, message: message.notification.body },
          };
          handleEvents([eventWithMessage]);
        }
      }
    },
    [handleEvents],
  );

  useEffect(() => {
    handleNativeNotificationListeners.add(handleNativeNotification);
    return () => handleNativeNotificationListeners.delete(handleNativeNotification);
  }, [handleNativeNotification]);

  useEffect(() => {
    if (!authenticated) return;
    const reconnectIfNeeded = () => {
      const socket = socketRef.current;
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        connectSocket();
      } else if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send('{}');
        } catch {
          // test connection
        }
      }
    };
    const onVisibility = () => {
      if (!document.hidden) {
        reconnectIfNeeded();
        loadPendingRef.current();
      }
    };
    window.addEventListener('online', reconnectIfNeeded);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', reconnectIfNeeded);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [authenticated, connectSocket]);

  return null;
};

export default SocketController;

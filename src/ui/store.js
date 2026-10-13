/** Host-backed client cache. Failed requests preserve data and disable editing until reconnection. */
import { emptyData, normalizeData } from './data.js';
/** Read-only legacy browser backup key. */
export const LEGACY_KEY = 'dsh.learning-desk.v1';
/** Own polling, cancellation and subscriptions for one plugin lifetime.
 * @param {object} options - Fetch, legacy storage and timer adapters.
 * @returns {object} Cache subscription, queued commands, refresh and disposal API.
 */
export function createStore({ fetcher = fetch, storage, timer = setInterval, clearTimer = clearInterval } = {}) {
    let state = { data: emptyData(), loading: true, busy: false, error: null, notices: [], legacy: null };
    let disposed = false;
    let fetching = false;
    let requestChain = Promise.resolve();
    let mutation = 0;
    const listeners = new Set();
    const controller = new AbortController();
    function emit(patch) { if (disposed)
        return; state = { ...state, ...patch }; for (const listener of listeners)
        listener(); }
    function request(command) {
        return (async () => {
            const response = await fetcher('/api/learning-desk', { method: command ? 'POST' : 'GET', credentials: 'same-origin', headers: command ? { 'content-type': 'application/json' } : {}, body: command ? JSON.stringify(command) : undefined, signal: controller.signal });
            const result = await response.json();
            if (!result.ok)
                throw new Error(result.code || 'unavailable');
            if (!result.value || result.value.version !== 1)
                throw new Error('unavailable');
            return result.value;
        })();
    }
    function refresh() {
        return (async () => {
            if (fetching || state.busy || disposed)
                return;
            fetching = true;
            const generation = mutation;
            try {
                const data = await request();
                if (generation === mutation && !state.busy)
                    emit({ data, loading: false, error: null });
            }
            catch (error) {
                if (!disposed)
                    emit({ loading: false, error: error.message || 'unavailable' });
            }
            finally {
                fetching = false;
            }
        })();
    }
    function command(value, notice = 'saved') {
        const work = requestChain.then(async () => {
            if (disposed || state.error)
                throw new Error(state.error || 'unavailable');
            mutation += 1;
            emit({ busy: true });
            try {
                const data = await request(value);
                emit({ data, error: null });
                if (notice)
                    toast(notice);
                return data;
            }
            catch (error) {
                toast(error.message || 'unavailable', true);
                if (error.message === 'writeUnknown' || error.message === 'unavailable')
                    emit({ error: error.message });
                throw error;
            }
            finally {
                emit({ busy: false });
            }
        });
        requestChain = work.catch(error => { /* The caller gets failure; later commands remain queued. */ void error; });
        return work;
    }
    function toast(key, error = false) { emit({ notices: [...state.notices, { id: crypto.randomUUID(), key, error, expires: Date.now() + 3000 }].slice(-3) }); }
    function initialize() {
        return (async () => {
            try {
                const raw = storage?.getItem(LEGACY_KEY);
                if (raw) {
                    try {
                        normalizeData(JSON.parse(raw));
                        emit({ legacy: { raw, valid: true } });
                    }
                    catch (error) {
                        emit({ legacy: { raw, valid: false } });
                    }
                }
            }
            catch (error) {
                toast('legacyCorrupt', true);
            }
            await refresh();
        })();
    }
    const interval = timer(() => {
        const notices = state.notices.filter(row => row.expires > Date.now());
        if (notices.length !== state.notices.length)
            emit({ notices });
        void refresh();
    }, 5000);
    return { get: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, command, refresh, initialize, toast,
        dispose() { disposed = true; controller.abort(); clearTimer(interval); listeners.clear(); return requestChain; },
    };
}
/** Download a user-owned JSON backup.
 * @param {object|string} data - Structured data or preserved legacy bytes.
 * @param {string} filename - Suggested download filename.
 * @returns {void} Starts a browser download and revokes the temporary URL.
 */
export function downloadJson(data, filename = 'learning-desk.json') {
    const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

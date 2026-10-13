/** Durable wall-clock timer transitions shared by Host, UI and deterministic tests. */
/** Project active elapsed time, capping countdowns at their target.
 * @param {object|null} timer - Persisted timer state.
 * @param {number} now - Current epoch milliseconds.
 * @returns {number} Active elapsed milliseconds, excluding paused time.
 */
export function elapsedMs(timer, now) {
    if (!timer)
        return 0;
    const elapsed = timer.accumulatedMs + (timer.status === 'running' ? Math.max(0, now - timer.resumedAt) : 0);
    return timer.mode === 'countup' ? elapsed : Math.min(elapsed, timer.targetMs);
}
/** Apply an action with an injected timestamp; never accrue paused time.
 * @param {object|null} timer - Current timer.
 * @param {string} action - Start, pause, resume, reset or finish.
 * @param {number} now - Epoch timestamp.
 * @param {object} options - Validated start values and generated identifier.
 * @returns {object|null} Next timer state; invalid actions reject.
 */
export function transitionTimer(timer, action, now, options = {}) {
    if (action === 'start') {
        if (timer)
            throw new Error('timerActive');
        if (!Number.isFinite(options.minutes) || options.minutes < 1)
            throw new Error('invalidForm');
        return { id: options.id, status: 'running', start: now, resumedAt: now, accumulatedMs: 0, targetMs: options.minutes * 60000, mode: options.mode || 'pomodoro', taskId: options.taskId || null, courseId: options.courseId || null };
    }
    if (!timer)
        throw new Error('timerMissing');
    if (action === 'pause')
        return { ...timer, status: 'paused', accumulatedMs: elapsedMs(timer, now), resumedAt: now };
    if (action === 'resume')
        return { ...timer, status: 'running', resumedAt: timer.status === 'running' ? timer.resumedAt : now };
    if (action === 'reset' || action === 'finish')
        return null;
    throw new Error('invalidForm');
}

/** Pure statistics derivation for the host-backed UI. */
import { heatmap, minutesByTag, completionRate, streakDays } from '../domain/stats.js';
import { calendarRecords, localDate, addDays, planFor } from './data.js';
/** Derive all chart data from persisted source records, excluding breaks.
 * @param {object} data - Learning tables and settings.
 * @param {string} today - Selected local ISO day.
 * @returns {object} Heatmap, trend, distributions, load and completion statistics.
 */
export function deriveStats(data, today) {
    const records = calendarRecords(data.focus_records);
    const byCourse = {};
    for (const row of data.focus_records)
        if (row.completed && row.mode !== 'break')
            byCourse[row.courseId || ''] = (byCourse[row.courseId || ''] || 0) + row.durationMin;
    const start = addDays(today, -((new Date(`${today}T12:00:00`).getDay() + 7 - data.settings.weekStartsOn) % 7));
    const load = Array.from({ length: 7 }, (_, i) => { const date = addDays(start, i); const plan = planFor(data, date); const courses = plan.blocks.filter(row => row.kind === 'course').reduce((sum, row) => sum + row.minutes, 0); const tasks = data.tasks.filter(row => row.date === date).reduce((sum, row) => sum + row.estimateMin, 0); return { date, minutes: courses + tasks }; });
    return { heatmap: heatmap(records, today, 12), trend: heatmap(records, today, 5).slice(-30), byTag: minutesByTag(records, data.tasks), byCourse, load, rate7: completionRate(data.tasks, addDays(today, -6), today), rate30: completionRate(data.tasks, addDays(today, -29), today), streak: streakDays(records, today, data.settings.dailyGoalMin) };
}

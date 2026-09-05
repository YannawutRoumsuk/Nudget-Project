import { closeDatabase } from '../src/lib/server/db';
import { runReminderCheck } from '../src/lib/server/reminders';

try {
	await runReminderCheck();
	console.log('[reminders] check complete');
} finally {
	await closeDatabase();
}

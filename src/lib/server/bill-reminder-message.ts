import { formatThaiShortDate } from '$lib/utils/date';
import { formatNumber } from '$lib/utils/money';

export type BillReminderStage = 'upcoming' | 'due' | 'overdue';

export interface BillReminderItem {
	id: number;
	name: string;
	amount: number;
	period: string;
	dueDate: Date;
	stage: BillReminderStage;
}

export interface BillFlexMessage {
	altText: string;
	contents: Record<string, unknown>;
}

const STAGE_LABEL: Record<BillReminderStage, string> = {
	upcoming: 'ใกล้ถึงกำหนด',
	due: 'ครบกำหนดวันนี้',
	overdue: 'เกินกำหนดแล้ว'
};

export function billReminderStage(daysUntilDue: number, reminderDaysBefore: number): BillReminderStage | null {
	if (daysUntilDue > 0 && daysUntilDue <= reminderDaysBefore) return 'upcoming';
	if (daysUntilDue === 0) return 'due';
	if (daysUntilDue < 0) return 'overdue';
	return null;
}

function billBubble(item: BillReminderItem, billsUrl: string): Record<string, unknown> {
	const tint = item.stage === 'overdue' ? '#B54738' : item.stage === 'due' ? '#C88718' : '#4A56C0';
	const buttons = [
		{ type: 'button', style: 'primary', color: tint, action: { type: 'postback', label: 'จ่ายแล้ว', data: `bill:pay:${item.id}:${item.period}`, displayText: 'จ่ายบิลแล้ว' } },
		{ type: 'button', style: 'secondary', action: { type: 'postback', label: 'เตือนพรุ่งนี้', data: `bill:snooze:${item.id}:${item.period}`, displayText: 'เลื่อนเตือนบิลนี้' } },
		...(billsUrl ? [{ type: 'button', style: 'link', action: { type: 'uri', label: 'เปิดบิล', uri: billsUrl } }] : [])
	];
	return {
		type: 'bubble',
		size: 'kilo',
		body: {
			type: 'box', layout: 'vertical', spacing: 'md', contents: [
				{ type: 'text', text: STAGE_LABEL[item.stage], color: tint, weight: 'bold', size: 'sm' },
				{ type: 'text', text: item.name, weight: 'bold', size: 'lg', wrap: true },
				{ type: 'text', text: `฿${formatNumber(item.amount)}`, size: 'xl', weight: 'bold' },
				{ type: 'text', text: `กำหนด ${formatThaiShortDate(item.dueDate)}`, color: '#777777', size: 'sm' }
			]
		},
		footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: buttons }
	};
}

/** LINE Flex carousels accept up to twelve bubbles per message. */
export function buildBillReminderMessages(items: BillReminderItem[], billsUrl: string): BillFlexMessage[] {
	const messages: BillFlexMessage[] = [];
	for (let offset = 0; offset < items.length; offset += 12) {
		const group = items.slice(offset, offset + 12);
		const altText = group.length === 1
			? `${STAGE_LABEL[group[0].stage]}: ${group[0].name} ${formatNumber(group[0].amount)} บาท`
			: `เตือนบิล ${STAGE_LABEL[group[0].stage]} ${group.length} รายการ`;
		messages.push({
			altText,
			contents: group.length === 1
				? billBubble(group[0], billsUrl)
				: { type: 'carousel', contents: group.map((item) => billBubble(item, billsUrl)) }
		});
	}
	return messages;
}

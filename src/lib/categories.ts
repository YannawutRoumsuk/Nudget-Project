import type { TxKind } from '$lib/server/db/schema';

export interface CategoryDef {
	id: string;
	nameTh: string;
	nameEn: string;
	kind: TxKind;
	icon: string;
	/** OKLCH hue anchor — the dashboard derives light/dark variants from this. */
	color: string;
	/** Lowercased substrings that route free text to this category. */
	keywords: string[];
}

export const EXPENSE_CATEGORIES: CategoryDef[] = [
	{
		id: 'food',
		nameTh: 'อาหาร',
		nameEn: 'Food',
		kind: 'expense',
		icon: '🍜',
		color: 'oklch(70% 0.17 45)',
		keywords: [
			'ข้าว','อาหาร','กิน','กับข้าว','ก๋วยเตี๋ยว','ส้มตำ','หมูกระทะ','ชาบู','บุฟเฟ่ต์','บุฟเฟต์',
			'กาแฟ','ชานม','น้ำ','ขนม','เบเกอรี่','เค้ก','พิซซ่า','ไก่ทอด','แมค','kfc','7-11','เซเว่น',
			'เซเวน','โลตัส','บิ๊กซี','ตลาด','ข้าวเช้า','ข้าวเที่ยง','ข้าวเย็น','มื้อ','starbucks','grabfood',
			'lineman','ไลน์แมน','ฟู้ด','food','coffee','lunch','dinner'
		]
	},
	{
		id: 'transport',
		nameTh: 'เดินทาง',
		nameEn: 'Transport',
		kind: 'expense',
		icon: '🚕',
		color: 'oklch(70% 0.15 240)',
		keywords: [
			'รถ','แท็กซี่','taxi','grab','bolt','วิน','มอไซค์','มอเตอร์ไซค์','bts','mrt','รถไฟฟ้า','รถไฟ',
			'รถเมล์','เรือ','น้ำมัน','เติมน้ำมัน','ปตท','ทางด่วน','ค่าทาง','จอดรถ','ที่จอด','ตั๋ว','เดินทาง',
			'ขนส่ง','uber','fuel','gas','parking'
		]
	},
	{
		id: 'shopping',
		nameTh: 'ช้อปปิ้ง',
		nameEn: 'Shopping',
		kind: 'expense',
		icon: '🛍️',
		color: 'oklch(70% 0.16 330)',
		keywords: [
			'ซื้อ','ช้อป','ช้อปปิ้ง','shopee','ช้อปปี้','lazada','ลาซาด้า','tiktok','เสื้อ','กางเกง','รองเท้า',
			'กระเป๋า','เครื่องสำอาง','สกินแคร์','ของใช้','ห้าง','uniqlo','ikea','shopping','amazon'
		]
	},
	{
		id: 'bills',
		nameTh: 'บิล/ค่าบริการ',
		nameEn: 'Bills',
		kind: 'expense',
		icon: '🧾',
		color: 'oklch(68% 0.13 200)',
		keywords: [
			'ค่าน้ำ','ค่าไฟ','ค่าเน็ต','เน็ต','อินเทอร์เน็ต','ค่าโทรศัพท์','ค่าเช่า','เช่าบ้าน','ค่าหอ','หอพัก',
			'ประกัน','ผ่อน','บิล','ค่าบริการ','ค่าส่วนกลาง','true','ais','dtac','netflix','spotify','youtube',
			'icloud','subscription','บิลบัตร','rent','bill'
		]
	},
	{
		id: 'entertainment',
		nameTh: 'บันเทิง',
		nameEn: 'Entertainment',
		kind: 'expense',
		icon: '🎮',
		color: 'oklch(70% 0.16 300)',
		keywords: [
			'หนัง','โรงหนัง','เกม','เกมส์','steam','บอร์ดเกม','คอนเสิร์ต','เที่ยว','ผับ','บาร์','เหล้า','เบียร์',
			'คาราโอเกะ','สวนสนุก','game','movie','concert'
		]
	},
	{
		id: 'health',
		nameTh: 'สุขภาพ',
		nameEn: 'Health',
		kind: 'expense',
		icon: '💊',
		color: 'oklch(72% 0.15 150)',
		keywords: [
			'หมอ','โรงพยาบาล','คลินิก','ยา','ร้านยา','ฟิตเนส','ยิม','gym','ตรวจสุขภาพ','ทันตกรรม','ฟัน',
			'วิตามิน','นวด','สปา','hospital','clinic','pharmacy'
		]
	},
	{
		id: 'education',
		nameTh: 'การเรียนรู้',
		nameEn: 'Education',
		kind: 'expense',
		icon: '📚',
		color: 'oklch(72% 0.14 100)',
		keywords: [
			'หนังสือ','คอร์ส','เรียน','ค่าเทอม','ติว','สัมมนา','udemy','coursera','course','book','บทเรียน'
		]
	},
	{
		id: 'home',
		nameTh: 'บ้าน',
		nameEn: 'Home',
		kind: 'expense',
		icon: '🏠',
		color: 'oklch(68% 0.11 60)',
		keywords: [
			'บ้าน','เฟอร์นิเจอร์','ซ่อม','ช่าง','ทำความสะอาด','แม่บ้าน','ผงซักฟอก','เครื่องใช้ไฟฟ้า','home','แอร์'
		]
	},
	{
		id: 'travel',
		nameTh: 'ท่องเที่ยว',
		nameEn: 'Travel',
		kind: 'expense',
		icon: '✈️',
		color: 'oklch(74% 0.14 190)',
		keywords: [
			'ทริป','โรงแรม','ที่พัก','airbnb','เครื่องบิน','ตั๋วเครื่องบิน','สายการบิน','agoda','booking',
			'ทัวร์','hotel','flight','trip'
		]
	},
	{
		id: 'other',
		nameTh: 'อื่นๆ',
		nameEn: 'Other',
		kind: 'expense',
		icon: '📦',
		color: 'oklch(65% 0.03 260)',
		keywords: []
	}
];

export const INCOME_CATEGORIES: CategoryDef[] = [
	{
		id: 'salary',
		nameTh: 'เงินเดือน',
		nameEn: 'Salary',
		kind: 'income',
		icon: '💰',
		color: 'oklch(72% 0.16 150)',
		keywords: ['เงินเดือน','salary','payroll','เงินออก']
	},
	{
		id: 'freelance',
		nameTh: 'ฟรีแลนซ์',
		nameEn: 'Freelance',
		kind: 'income',
		icon: '💼',
		color: 'oklch(72% 0.14 170)',
		keywords: ['ฟรีแลนซ์','freelance','รับงาน','ค่าจ้าง','งานเสริม','commission','ค่าคอม']
	},
	{
		id: 'bonus',
		nameTh: 'โบนัส/ของขวัญ',
		nameEn: 'Bonus',
		kind: 'income',
		icon: '🎁',
		color: 'oklch(74% 0.15 130)',
		keywords: ['โบนัส','bonus','อั่งเปา','ของขวัญ','คืนเงิน','refund','cashback']
	},
	{
		id: 'investment',
		nameTh: 'ลงทุน',
		nameEn: 'Investment',
		kind: 'income',
		icon: '📈',
		color: 'oklch(70% 0.15 190)',
		keywords: ['ปันผล','ดอกเบี้ย','หุ้น','กองทุน','คริปโต','crypto','dividend','interest','ขายหุ้น']
	},
	{
		id: 'other_income',
		nameTh: 'รายรับอื่น',
		nameEn: 'Other income',
		kind: 'income',
		icon: '💵',
		color: 'oklch(68% 0.06 160)',
		keywords: []
	}
];

export const ALL_CATEGORIES: CategoryDef[] = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

export const FALLBACK_CATEGORY: Record<TxKind, string> = {
	expense: 'other',
	income: 'other_income'
};

const byId = new Map(ALL_CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): CategoryDef | undefined {
	return byId.get(id);
}

export function categoryLabel(id: string): string {
	return byId.get(id)?.nameTh ?? id;
}

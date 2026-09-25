export function GET() {
	const body = '\uFEFFdate,amount,kind,note,payment_method,category\r\n';
	return new Response(body, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': 'attachment; filename="nudget-import-template.csv"',
			'Cache-Control': 'no-store'
		}
	});
}

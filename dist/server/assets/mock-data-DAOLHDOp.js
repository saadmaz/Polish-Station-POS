//#region src/lib/mock-data.ts
var SERVICES = [
	{
		id: "sv1",
		name: "Express Exterior Wash",
		category: "Exterior",
		price: 2500,
		durationMin: 30
	},
	{
		id: "sv2",
		name: "Premium Hand Wash",
		category: "Exterior",
		price: 4500,
		durationMin: 60
	},
	{
		id: "sv3",
		name: "Interior Deep Clean",
		category: "Interior",
		price: 6500,
		durationMin: 90
	},
	{
		id: "sv4",
		name: "Full Detail Package",
		category: "Full Detail",
		price: 18500,
		durationMin: 240
	},
	{
		id: "sv5",
		name: "Ceramic Coating",
		category: "Coating",
		price: 75e3,
		durationMin: 480
	},
	{
		id: "sv6",
		name: "Paint Correction",
		category: "Paint Protection",
		price: 28e3,
		durationMin: 300
	}
];
var JOBS = [
	{
		id: "J-1042",
		customer: "Hasini Wijesuriya",
		vehicle: "Toyota Aqua 2018",
		plate: "CAR-4521",
		color: "Pearl White",
		service: "Premium Hand Wash",
		category: "Exterior",
		tech: "Imran S.",
		bay: "Bay 2",
		status: "In Bay",
		elapsedMin: 32,
		estimateMin: 60
	},
	{
		id: "J-1043",
		customer: "Marcus Fernando",
		vehicle: "BMW 320i 2021",
		plate: "WP CAR-8821",
		color: "Alpine White",
		service: "Ceramic Coating",
		category: "Coating",
		tech: "Dilshan H.",
		bay: "Bay 4",
		status: "In Bay",
		elapsedMin: 210,
		estimateMin: 480
	},
	{
		id: "J-1044",
		customer: "Priya Jayasinghe",
		vehicle: "Honda Vezel 2019",
		plate: "CAR-1145",
		color: "Crystal Black",
		service: "Full Detail Package",
		category: "Full Detail",
		tech: "Imran S.",
		bay: "Bay 1",
		status: "Awaiting QC",
		elapsedMin: 245,
		estimateMin: 240
	},
	{
		id: "J-1045",
		customer: "Sahan De Silva",
		vehicle: "Suzuki Swift 2020",
		plate: "CAR-3398",
		color: "Solid Red",
		service: "Interior Deep Clean",
		category: "Interior",
		tech: "Dilshan H.",
		bay: "—",
		status: "Queue",
		elapsedMin: 0,
		estimateMin: 90
	},
	{
		id: "J-1046",
		customer: "Lakmal Perera",
		vehicle: "Nissan X-Trail 2017",
		plate: "WP CAB-2204",
		color: "Gunmetal",
		service: "Paint Correction",
		category: "Paint Protection",
		tech: "Imran S.",
		bay: "Bay 3",
		status: "On Hold",
		elapsedMin: 75,
		estimateMin: 300
	},
	{
		id: "J-1047",
		customer: "Anjali Mendis",
		vehicle: "Mazda CX-5 2022",
		plate: "CAR-9087",
		color: "Soul Red",
		service: "Express Exterior Wash",
		category: "Exterior",
		tech: "Dilshan H.",
		bay: "Bay 5",
		status: "Ready",
		elapsedMin: 28,
		estimateMin: 30
	},
	{
		id: "J-1041",
		customer: "Roshan Karu",
		vehicle: "Toyota Prius 2016",
		plate: "CAR-2210",
		color: "Silver",
		service: "Premium Hand Wash",
		category: "Exterior",
		tech: "Imran S.",
		bay: "Bay 2",
		status: "Done Today",
		elapsedMin: 55,
		estimateMin: 60
	}
];
var CUSTOMERS = [
	{
		id: "c1",
		name: "Hasini Wijesuriya",
		phone: "+94 77 412 8821",
		email: "hasini@example.lk",
		visits: 28,
		spend: 184200,
		lastVisit: "Today",
		tier: "Platinum",
		vehicles: 2
	},
	{
		id: "c2",
		name: "Marcus Fernando",
		phone: "+94 71 905 4421",
		email: "m.fernando@example.lk",
		visits: 12,
		spend: 96500,
		lastVisit: "Today",
		tier: "Gold",
		vehicles: 1
	},
	{
		id: "c3",
		name: "Priya Jayasinghe",
		phone: "+94 76 221 9087",
		email: "priya.j@example.lk",
		visits: 9,
		spend: 41200,
		lastVisit: "Today",
		tier: "Silver",
		vehicles: 1
	},
	{
		id: "c4",
		name: "Sahan De Silva",
		phone: "+94 70 884 1102",
		email: "sahan@example.lk",
		visits: 3,
		spend: 8400,
		lastVisit: "2 days ago",
		tier: "Bronze",
		vehicles: 1
	},
	{
		id: "c5",
		name: "Lakmal Perera",
		phone: "+94 77 100 5523",
		email: "l.perera@example.lk",
		visits: 17,
		spend: 122900,
		lastVisit: "Today",
		tier: "Gold",
		vehicles: 3
	},
	{
		id: "c6",
		name: "Anjali Mendis",
		phone: "+94 78 442 1100",
		email: "anjali@example.lk",
		visits: 5,
		spend: 14500,
		lastVisit: "Today",
		tier: "Silver",
		vehicles: 1
	},
	{
		id: "c7",
		name: "Roshan Karu",
		phone: "+94 75 220 9981",
		email: "roshan.k@example.lk",
		visits: 41,
		spend: 312400,
		lastVisit: "Today",
		tier: "Platinum",
		vehicles: 2
	}
];
var INVENTORY = [
	{
		id: "i1",
		name: "Meguiar's Gold Class Shampoo",
		sku: "MG-GC-1L",
		category: "Wash & Rinse",
		unit: "L",
		stock: 18,
		reorder: 10,
		cost: 4200,
		supplier: "AutoCare Lanka"
	},
	{
		id: "i2",
		name: "Sonax Clay Bar Kit",
		sku: "SX-CB-K",
		category: "Clay Bar",
		unit: "kit",
		stock: 4,
		reorder: 6,
		cost: 5800,
		supplier: "Detail Imports"
	},
	{
		id: "i3",
		name: "Gtechniq Crystal Serum Light",
		sku: "GT-CSL-50",
		category: "Sealants & Coatings",
		unit: "50ml",
		stock: 2,
		reorder: 3,
		cost: 32500,
		supplier: "Detail Imports"
	},
	{
		id: "i4",
		name: "Microfiber Towel 40x40",
		sku: "MF-4040",
		category: "Microfiber",
		unit: "pc",
		stock: 142,
		reorder: 60,
		cost: 350,
		supplier: "Local Textiles"
	},
	{
		id: "i5",
		name: "Foam Cannon Snow Soap",
		sku: "FC-SS-5L",
		category: "Wash & Rinse",
		unit: "5L",
		stock: 0,
		reorder: 4,
		cost: 7400,
		supplier: "AutoCare Lanka"
	},
	{
		id: "i6",
		name: "Interior All-Purpose Cleaner",
		sku: "IAP-C-1L",
		category: "Interior Cleaners",
		unit: "L",
		stock: 11,
		reorder: 8,
		cost: 1850,
		supplier: "AutoCare Lanka"
	},
	{
		id: "i7",
		name: "Polish Compound Cut",
		sku: "PC-CUT-1L",
		category: "Polish & Compound",
		unit: "L",
		stock: 6,
		reorder: 5,
		cost: 6900,
		supplier: "Detail Imports"
	}
];
var BOOKINGS = [
	{
		id: "B-201",
		time: "08:30",
		customer: "Roshan Karu",
		vehicle: "Toyota Prius",
		service: "Premium Hand Wash",
		category: "Exterior",
		tech: "Imran S.",
		status: "Checked-In",
		durationMin: 60
	},
	{
		id: "B-202",
		time: "09:00",
		customer: "Hasini W.",
		vehicle: "Toyota Aqua",
		service: "Premium Hand Wash",
		category: "Exterior",
		tech: "Imran S.",
		status: "Checked-In",
		durationMin: 60
	},
	{
		id: "B-203",
		time: "09:30",
		customer: "Marcus F.",
		vehicle: "BMW 320i",
		service: "Ceramic Coating",
		category: "Coating",
		tech: "Dilshan H.",
		status: "Checked-In",
		durationMin: 480
	},
	{
		id: "B-204",
		time: "10:00",
		customer: "Priya J.",
		vehicle: "Honda Vezel",
		service: "Full Detail",
		category: "Full Detail",
		tech: "Imran S.",
		status: "Checked-In",
		durationMin: 240
	},
	{
		id: "B-205",
		time: "11:30",
		customer: "Anjali M.",
		vehicle: "Mazda CX-5",
		service: "Express Wash",
		category: "Exterior",
		tech: "Dilshan H.",
		status: "Confirmed",
		durationMin: 30
	},
	{
		id: "B-206",
		time: "13:00",
		customer: "Tharindu A.",
		vehicle: "Audi A4",
		service: "Paint Correction",
		category: "Paint Protection",
		tech: "—",
		status: "Confirmed",
		durationMin: 300
	},
	{
		id: "B-207",
		time: "14:30",
		customer: "Senuri K.",
		vehicle: "Kia Sportage",
		service: "Interior Deep Clean",
		category: "Interior",
		tech: "—",
		status: "Pending",
		durationMin: 90
	},
	{
		id: "B-208",
		time: "16:00",
		customer: "Kasun L.",
		vehicle: "Nissan Leaf",
		service: "Express Wash",
		category: "Exterior",
		tech: "—",
		status: "Confirmed",
		durationMin: 30
	}
];
var INVOICES = [
	{
		id: "INV-2087",
		customer: "Roshan Karu",
		total: 4500,
		status: "Paid",
		date: "Today 09:30",
		method: "Card"
	},
	{
		id: "INV-2088",
		customer: "Hasini Wijesuriya",
		total: 4500,
		status: "Paid",
		date: "Today 10:05",
		method: "Cash"
	},
	{
		id: "INV-2089",
		customer: "Priya Jayasinghe",
		total: 18500,
		status: "Issued",
		date: "Today 14:10",
		method: "—"
	},
	{
		id: "INV-2090",
		customer: "Marcus Fernando",
		total: 82500,
		status: "Partially Paid",
		date: "Today 14:45",
		method: "Card + Cash"
	},
	{
		id: "INV-2086",
		customer: "Sahan De Silva",
		total: 6500,
		status: "Issued",
		date: "Yesterday",
		method: "—"
	}
];
//#endregion
export { JOBS as a, INVOICES as i, CUSTOMERS as n, SERVICES as o, INVENTORY as r, BOOKINGS as t };

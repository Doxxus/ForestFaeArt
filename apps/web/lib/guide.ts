/**
 * The Owner Guide, the staff quick-start and the market-day checklist (HAND-5). Plain words, no jargon, and nothing
 * about features that don't exist yet. It is data, not markup, so a test can check the words and the pages stay small.
 * Pictures are real screenshots in public/guide (see docs/runbook.md for how to retake them).
 */

export interface GuideShot {
  /** File name in public/guide. */
  file: string;
  /** What the picture shows, for someone who can't see it. */
  alt: string;
}

export interface GuideSection {
  id: string;
  title: string;
  /** What this part is for, in a sentence or two. */
  intro: string;
  steps?: string[];
  tips?: string[];
  shot?: GuideShot;
}

export const OWNER_GUIDE: GuideSection[] = [
  {
    id: "start",
    title: "Where everything is",
    intro: "You use two things: the admin on a computer or phone (the page you are on now), and the POS app on your phone for selling at markets.",
    steps: [
      "Sign in with your email and password at forestfae.ca/login, or press “Owner sign in” at the very bottom of your website.",
      "The Dashboard shows what needs your attention: messages waiting, pieces that need photos, and today's sales.",
      "The menu at the top takes you everywhere. On a phone, press Menu.",
      "The “?” button at the top right explains whatever page you are on, in plain words.",
    ],
    tips: ["Nothing you do here can break your website. Pieces and events are never deleted, only put away, and you can bring them back.", "Forgotten your password? Ask your developer for a new link."],
    shot: { file: "dashboard.png", alt: "The dashboard, with the menu along the top and cards showing what needs attention." },
  },
  {
    id: "products",
    title: "Adding a piece",
    intro: "A piece is one thing you have made. Each gets its own number (like FFA-000012), which is printed on its label.",
    steps: [
      "Open Products and press Add a piece.",
      "Type a title and a price. Leave “How many” at 1 unless you have several the same.",
      "Press Add. You land on the piece's page, where you can add photos, a description and the details.",
      "Fill in the details that matter to you, such as the species and where it came from. The “Provenance” detail is for where a piece was sourced.",
    ],
    tips: ["A new piece starts as a Draft, so nothing shows on your website until you say so.", "The price on your website is the price you type here. Tick “Hide the price” on a piece to show “Inquire” instead."],
    shot: { file: "product.png", alt: "A piece's page, with its photos, details and status." },
  },
  {
    id: "photos",
    title: "Photos",
    intro: "Photos make a piece show on your website. Without at least one, a piece shows a standard picture and can't appear.",
    steps: [
      "Open a piece and press Add photos. On a phone you can take a picture straight away or choose from your gallery.",
      "Drag the photos to put them in order. The first one is the picture people see first.",
      "Under each photo, type a short description of what it shows. This helps people who use screen readers, and search engines.",
      "Not sure which pieces still need photos? Open Products, open the filters, and choose “Needs photos” in the Photos box.",
    ],
    tips: ["Natural light and a plain background work best. Take a few from different angles.", "Photos are made smaller automatically for phones, so you don't need to resize them."],
  },
  {
    id: "stock",
    title: "Keeping track of what you have",
    intro: "Every piece has a status that says where it is. Change it when something happens, and the website follows.",
    steps: [
      "Draft: still being made or photographed. Not on the website.",
      "Available: ready to sell, and shown on the website once it has a photo.",
      "Reserved: you are holding it for someone. It shows as reserved.",
      "At an event: you have taken it to a market. It can only be sold there.",
      "Sold: it's gone. It stays on your website as sold, so people can see your past work.",
      "Archived: put away. Never deleted, and you can bring it back.",
    ],
    tips: ["Pieces you have several of (like prints) have a count, and the status changes by itself when the count reaches zero.", "The history at the bottom of a piece shows every change: what, when and who. It can't be edited."],
  },
  {
    id: "events",
    title: "Markets and events",
    intro: "Add the markets and shows you go to. They appear on your website, and visitors can add them to their calendar.",
    steps: [
      "Open Events and press Add an event. Type the name, the dates and where it is, then press Add.",
      "On the event's page, add opening hours, a picture and the pieces you are taking. Those pieces show as “At an event”.",
      "Choose Published when it's ready for visitors. A Draft stays private.",
      "When the event is over, press Wrap up. Everything that didn't sell goes back on the shelf in one go.",
    ],
    tips: ["Sales you make in the POS app are linked to the event that is on at the time.", "A cancelled event stays on your list, marked as cancelled."],
    shot: { file: "events.png", alt: "The events list, with upcoming and past events." },
  },
  {
    id: "labels",
    title: "Printing labels",
    intro: "Each label has a QR code. Scanning it with a phone camera opens that piece on your website, and scanning it in the POS app opens it ready to sell.",
    steps: [
      "Open Labels and choose which pieces: ones with no label yet, ones whose label is out of date, an event, or ones you pick.",
      "Check the preview. The standard label is 40 by 30 millimetres, for your NIIMBOT B1 printer.",
      "To print straight to the printer, use Chrome on an Android phone: press the connect button, choose your printer, then print.",
      "No printer to hand? Make a PDF or a sheet of labels to print on ordinary paper.",
    ],
    tips: ["A label is flagged “out of date” when the title or price changed after it was printed. Reprint it.", "A printed QR code has to keep working for years, so please don't change your website's address without asking your developer.", "Check “Printer test” before a market to be sure the printer connects."],
    shot: { file: "labels.png", alt: "The labels page, choosing which pieces to print and showing a preview." },
  },
  {
    id: "selling",
    title: "Selling at a market",
    intro: "Use the POS app on your phone. It works with no signal, and sends the sales when you are back online.",
    steps: [
      "Open the app and sign in with your email and password.",
      "Scan the label on a piece, or type its name or number.",
      "Press Sell now, choose how they paid, and press Record sale.",
      "To sell several things at once, add each to the cart, then check out.",
      "Made a mistake? Open Today, find the sale, and press Undo. The piece goes back in stock.",
    ],
    tips: ["Card payments are taken on your own card reader. The app only records how the customer paid.", "With no signal the app says “Saved on this phone”. It sends the sale by itself when you are back online. The More tab shows any that are waiting.", "If a piece is also listed on Etsy, the app reminds you to update it there.", "A customer can have a receipt by email, or you can share it from your phone."],
  },
  {
    id: "inquiries",
    title: "Messages from your website",
    intro: "When someone writes to you through your website, it arrives in Inquiries, and in your email too.",
    steps: ["Open Inquiries and press a message to read it.", "Type a reply and press Send reply. It is sent from your own address, and their answer comes to your inbox.", "When you are done, press Archive so it leaves your list."],
    tips: ["Every message is saved here even if an email goes astray.", "If a message says its email didn't send, it is still here. Reply from this page."],
  },
  {
    id: "website",
    title: "Your website",
    intro: "The words on your website, like About and Contact, are edited under Website. Your name, tagline, Instagram and Etsy links are in Settings.",
    steps: [
      "Open Website, pick a page and change the text. A blank line starts a new paragraph.",
      "Text that says “lorem ipsum” is placeholder text. Replace it with your own words.",
      "In Settings, check “Before you publish”. It lists what is left to do.",
      "When you are ready, press Publish my website. Until then visitors see a “Coming soon” page.",
    ],
    tips: ["You can look at your website any time while you are signed in, even before it is published.", "You can hide it again with one button if you need to."],
    shot: { file: "settings.png", alt: "The settings page, with the publish checklist at the top." },
  },
  {
    id: "staff",
    title: "Adding someone to help",
    intro: "Staff can sell and look after pieces. They can't see what a piece cost you, your customers' details, your sales totals or your settings.",
    steps: ["Open Users and fill in their name and email, choose Staff, and press Add and get link.", "Send them the private link. They choose their own password.", "To stop someone signing in, switch them off. Their past sales stay in your records."],
    tips: ["Give them the one-page staff quick-start and the market-day checklist (both in this Guide's menu)."],
  },
  {
    id: "data",
    title: "Your data and backups",
    intro: "Everything is kept safe for you. A copy is made every night, and the last 30 days are kept.",
    steps: ["Open Settings and look for “Your data and backups”. It shows when the last backup was made.", "Press “Back up now” before you make a big change, like importing a lot of pieces.", "Press “Download all my data” for a zip of spreadsheets of your pieces, sales, customers, events and messages."],
    tips: ["The download is for your own records. It doesn't include photos. Photos are backed up separately every night.", "If something is ever deleted or changed by mistake, tell your developer straight away. It can be put back."],
  },
  {
    id: "who",
    title: "Who looks after what",
    intro: "Your website and its tools are kept in an account that your developer looks after for now. This is the plain story of who holds what, so nothing is a surprise.",
    steps: [
      "Your domain, forestfae.ca, and the hosting for your website both sit in one account that your developer currently holds and pays for. You have access to it as a member.",
      "In the weeks after the handover, that account is passed to you, so that you own it and pay for it directly. Nothing about your website, your email or your printed QR codes changes when that happens.",
      "Your developer pays for the small monthly cost of the hosting until the account is passed to you. After that the costs are yours: the hosting plan (about five US dollars a month if it is needed), the domain renewal once every few years, and the email sending service if you ever outgrow its free tier.",
      "Two separate accounts are yours from day one: your own sign-in here, and your email sending account, which you create at the handover.",
    ],
    tips: ["Your developer keeps a written plan for passing the account over, with a date. Ask about it any time.", "If you can't reach your developer in an emergency, there is a short guide for that in the runbook. Your developer will show you where it is."],
  },
  {
    id: "wrong",
    title: "If something goes wrong",
    intro: "Most problems fix themselves with a refresh. If not, here is what to do.",
    steps: [
      "A page says “Something went wrong”? Press “Try again”. If it keeps happening, write down the short code it shows (like K7M2QX4P) and send it to your developer. The code finds exactly what happened.",
      "Can't sign in? Check the email and password, then ask your developer for a new link.",
      "No signal at a market? Keep selling in the POS app. Sales wait on the phone and send themselves when you are back online.",
      "Label printer won't connect? Switch it off and on, keep it close, and try again. If it still won't, make a PDF label and print that.",
      "Think something was deleted or changed by mistake? Don't try to fix it. Tell your developer, who can look back through the history and restore it.",
      "Your website is down? You will probably hear from your developer before you notice. If not, message them.",
    ],
  },
];

export const STAFF_QUICK_START = {
  title: "Quick start for staff",
  intro: "How to sell with the POS app on your phone. Keep this page handy.",
  steps: [
    "Open the POS app and sign in with your email and password.",
    "Scan the QR label on a piece, or type its name or number.",
    "The piece opens. Check it is the right one, then press Sell now.",
    "Choose how the customer is paying: cash, card, e-transfer or other.",
    "Press Record sale. You are done.",
    "Sold two things together? Add both to the cart, then check out once.",
  ],
  oops: [
    "Sold the wrong piece? Open Today, find the sale and press Undo. You can undo your own sales from today.",
    "No signal? Carry on. The app says “Saved on this phone” and sends the sale later.",
    "A piece won't scan? Type part of its name in the search box.",
    "It says a piece is already sold? Believe it. Another sale was recorded. Ask the owner.",
    "A customer wants a receipt? Add their email on the last screen, or share it from your phone.",
  ],
  never: ["Don't give a discount unless the owner said so. The app asks for a reason and it is recorded.", "Don't share your password. Everyone has their own."],
};

export const MARKET_DAY = {
  title: "Market day checklist",
  intro: "Tick things off as you go. Print this page, or keep it open on your phone.",
  before: [
    "Pieces chosen, and added to the event in the admin (so they show “At an event”).",
    "Labels printed and stuck on. Any flagged “out of date” reprinted.",
    "Label printer charged, with a spare roll. Try “Printer test” once.",
    "Phones charged, with the POS app signed in on each.",
    "Card reader charged, and cash float counted.",
    "Receipts and bags, a pen, and the price of anything without a label.",
    "Signal check: open the POS app and make sure the pieces load.",
  ],
  during: [
    "Scan each piece as you sell it, and pick how it was paid.",
    "Reserving something for someone? Change its status to Reserved in the admin.",
    "Wrong sale? Undo it from Today, straight away.",
    "No signal? Keep going. Sales send by themselves later.",
    "Quiet moment: check the More tab that no sales are waiting.",
  ],
  after: [
    "Back online: open the POS app and check nothing is waiting in More.",
    "Check Today: the number of sales and the total match your takings.",
    "Wrap up the event in the admin, so what didn't sell goes back on the shelf.",
    "Write down anything you learned: what sold, what people asked about.",
    "Charge the phones and the printer.",
  ],
};

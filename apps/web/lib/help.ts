/**
 * Plain-language help for every admin page, shown in the "?" drawer (ADM-1). It is data, not markup, so the Owner Guide
 * (HAND-5) can reuse the same words. Keep it short, in everyday language, and true to what the page does.
 */

export interface HelpTopic {
  /** What this page is, as the heading of the drawer. */
  title: string;
  /** One or two sentences on what the page is for. */
  about: string;
  /** Things you can do here, as short instructions. */
  steps?: string[];
  /** Good to know. */
  tips?: string[];
}

interface Route {
  /** Matches the page's address, for example /admin/products/FFA-000001. */
  match: RegExp;
  topic: HelpTopic;
}

const ROUTES: Route[] = [
  {
    match: /^\/admin\/setup\/?$/,
    topic: {
      title: "The Setup Wizard",
      about: "Seven short steps to get your shop ready. Nothing here is permanent.",
      steps: ["Fill in each step, then press Save and continue.", "Not ready for a step? Press Skip this step. Only the first one (your business details) is needed.", "Press Leave and carry on later at the top any time. Your place is kept."],
      tips: ["You can run the wizard again from Settings whenever you like. It only walks you through the steps and doesn't change anything you already saved.", "Want to look around with pretend pieces first? Add the sample data in Step 5 or in Settings."],
    },
  },
  {
    match: /^\/admin\/products\/new\/?$/,
    topic: {
      title: "Adding a piece",
      about: "A piece is one thing you have made. Fill in the basics here and add the photos on the next page.",
      steps: ["Type a title and a price.", "Leave “How many” at 1 unless you have several the same.", "Press Add. You will go to the piece's page to add photos and more details."],
      tips: ["A new piece starts as a Draft, so nothing shows on your website until you are ready.", "To show on your website a piece needs at least one photo, to be Available, and “Show on the website” ticked."],
    },
  },
  {
    match: /^\/admin\/products\/[^/]+\/?$/,
    topic: {
      title: "A piece",
      about: "Everything about one piece: its details, photos, how many you have, its label and its history.",
      steps: [
        "Drag photos to put them in order. The first one is the picture people see first. Add a short description of each photo for people who use screen readers.",
        "Change the status when something happens: Reserved when you hold it for someone, At an event when you take it to a market, Sold when it's gone.",
        "Press Print a label to make a label with its QR code.",
      ],
      tips: ["Nothing is ever deleted. A piece you no longer sell is Archived, and you can bring it back.", "The history at the bottom shows every change: what, when and who.", "If the title or price changes after a label is printed, the label is flagged so you remember to reprint it."],
    },
  },
  {
    match: /^\/admin\/products\/?$/,
    topic: {
      title: "Products",
      about: "All your pieces in one list. Search by title or number, and narrow the list with the filters.",
      steps: ["Type in the search box to find a piece by title or by its number (like FFA-000012).", "Use the filters for status, photos, Etsy and labels.", "Tick pieces and press Print labels to make labels for several at once.", "Press Add a piece to create a new one."],
      tips: ["A “Needs photos” note means the piece can't show on your website yet.", "Pieces marked Sample are practice pieces. You can remove them in Settings."],
    },
  },
  {
    match: /^\/admin\/events\/new\/?$/,
    topic: {
      title: "Adding an event",
      about: "An event is a market, fair or show. Start with the basics and add the rest on the next page.",
      steps: ["Type the name and choose when it starts and ends.", "Choose where in Canada it is, so the times are right.", "Press Add. You can then add opening hours, a picture and the pieces you are taking."],
    },
  },
  {
    match: /^\/admin\/events\/[^/]+\/wrap-up\/?$/,
    topic: {
      title: "Wrapping up an event",
      about: "When the event is over, this brings back everything that didn't sell.",
      steps: ["Check the list of pieces that will go back on the shelf.", "Press the button to confirm."],
      tips: ["Pieces that sold stay sold. Nothing is lost.", "You can do this on your phone, standing at the market."],
    },
  },
  {
    match: /^\/admin\/events\/[^/]+\/?$/,
    topic: {
      title: "An event",
      about: "The details of one market, and which pieces you are taking to it.",
      steps: ["Choose Published when it is ready for visitors to see. A Draft stays private.", "Search for pieces and add them to the event. They show as “At an event” and are not offered anywhere else.", "When it's over, press Wrap up to bring back what didn't sell."],
      tips: ["Sales made in the POS app are linked to the event that is on at the time.", "Cancelled events stay on your list, marked as cancelled."],
    },
  },
  {
    match: /^\/admin\/events\/?$/,
    topic: {
      title: "Events",
      about: "Your markets, fairs and shows, coming up and past.",
      steps: ["Press Add an event to create one.", "Open an event to add pieces, set opening hours or wrap it up afterwards."],
      tips: ["Use the tabs to switch between coming up, past and archived events."],
    },
  },
  {
    match: /^\/admin\/labels\/printer-test\/?$/,
    topic: {
      title: "Printer test",
      about: "Checks that your label printer works with this phone or computer before a market.",
      steps: ["Switch the printer on and keep it close.", "Press the connect button and choose your printer from the list.", "Print the test label and check it looks right."],
      tips: ["Printing straight from the browser works in Chrome on Android. If it doesn't connect, make a PDF label instead."],
    },
  },
  {
    match: /^\/admin\/labels\/templates\/?$/,
    topic: {
      title: "Label layouts",
      about: "The designs your labels can use: what is on them and how big they are.",
      steps: ["Pick the layout you use most as your default.", "Change what shows (title, price, number) and see a preview before you save."],
      tips: ["The label that already works with your printer is kept as it is. Make a copy before changing a layout."],
    },
  },
  {
    match: /^\/admin\/labels\/?$/,
    topic: {
      title: "Labels",
      about: "Make labels with a QR code for your pieces. Scanning one opens the piece, in your phone camera or in the POS app.",
      steps: ["Choose which pieces: ones with no label yet, ones whose label is out of date, an event, a category, or ones you picked.", "Check the preview.", "Print to your label printer, or make a PDF or a sheet of labels to print on paper."],
      tips: ["A label is flagged “out of date” when the title or price changed after it was printed.", "A QR code on a printed label must keep working for years, so please don't change your website address casually."],
    },
  },
  {
    match: /^\/admin\/sales\/[^/]+\/?$/,
    topic: {
      title: "A sale",
      about: "What was sold, how it was paid, and who bought it.",
      steps: ["If you need to send the customer a receipt, type their email address and press Send receipt.", "If the sale was a mistake, open “I need to undo this sale”, say why, and press Undo the sale. The pieces go back in stock."],
      tips: ["Card payments are taken on your own card reader. Here you only see how the customer paid.", "An undone sale stays on the list, marked as undone, and isn't counted in your totals."],
    },
  },
  {
    match: /^\/admin\/sales\/?$/,
    topic: {
      title: "Sales",
      about: "Everything you have sold, with the totals.",
      steps: ["Use the filters to look at a day, a market or a way of paying, then press Show these.", "Press Download as a spreadsheet to keep a copy of the list for your records."],
      tips: ["Sales are recorded in the POS app on your phone, not here."],
    },
  },
  {
    match: /^\/admin\/customers\/new\/?$/,
    topic: { title: "Adding a customer", about: "Save someone's details so you can find them again.", tips: ["Every field is optional. Only add what the person is happy for you to keep.", "Tick the email box only if they said they'd like to hear from you."] },
  },
  {
    match: /^\/admin\/customers\/[^/]+\/?$/,
    topic: {
      title: "A customer",
      about: "One person's details and what they have bought.",
      steps: ["Edit their details and press Save.", "If someone asks you to delete their information, open “They asked me to delete their information” and follow the steps. Their name, email, phone and notes are erased for good, but your sales stay in your records."],
    },
  },
  {
    match: /^\/admin\/customers\/?$/,
    topic: { title: "Customers", about: "People who have bought from you or asked you to hold a piece.", steps: ["Search by name or email.", "Press Download as a spreadsheet to keep a copy of your customers."], tips: ["Adding a customer to a sale is always optional."] },
  },
  {
    match: /^\/admin\/inquiries\/[^/]+\/?$/,
    topic: { title: "A message", about: "A message from someone on your website, and your replies.", steps: ["Read it, then type a reply and press Send reply.", "When you are done, press Archive this message so it leaves your list."], tips: ["Replies are sent from your own address, and the person's answer arrives in your inbox."] },
  },
  {
    match: /^\/admin\/inquiries\/?$/,
    topic: { title: "Inquiries", about: "Messages from your website's contact form and from pieces people ask about.", steps: ["Open a message to read and reply."], tips: ["Every message is saved here even if an email goes astray.", "If a message says its email didn't send, it is still here. Reply from this page."] },
  },
  {
    match: /^\/admin\/website\/[^/]+\/?$/,
    topic: { title: "Editing a page", about: "The words on one page of your website.", steps: ["Change the text and press Save.", "A blank line starts a new paragraph."], tips: ["Text that says “lorem ipsum” is placeholder text. Please replace it with your own words."] },
  },
  {
    match: /^\/admin\/website\/?$/,
    topic: { title: "Website", about: "The words on your website's pages, like About and Contact.", steps: ["Open a page to edit it."], tips: ["Pages that still have placeholder text are marked, so you know which ones to write.", "Your Instagram, Etsy and email addresses are in Settings."] },
  },
  {
    match: /^\/admin\/categories\/?$/,
    topic: { title: "Categories", about: "Groups like Butterfly, Moth or Jewelry. Visitors use them to browse.", steps: ["Add a category with a name.", "Use the arrows to change the order.", "Tick Hidden to keep one off the website."], tips: ["A category is never deleted, only archived. The pieces in it are not touched."] },
  },
  {
    match: /^\/admin\/fields\/?$/,
    topic: { title: "Fields", about: "The extra details you can record for each piece, such as species or frame colour.", steps: ["Add your own field with a name and a type (text, a list of choices, a year, and so on).", "Choose whether visitors can see a field on your website, and whether they can narrow the list by it."], tips: ["Removing a field only hides it. The details you already saved are kept."] },
  },
  {
    match: /^\/admin\/import\/?$/,
    topic: { title: "Import", about: "Bring in a spreadsheet of pieces you already have.", steps: ["Download the template and fill it in, or use your own spreadsheet.", "Upload it and look at the preview.", "If it looks right, confirm."], tips: ["Nothing is saved until you confirm.", "Changed your mind? You can undo an import afterwards."] },
  },
  {
    match: /^\/admin\/users\/?$/,
    topic: { title: "Users", about: "The people who can sign in: you and your staff.", steps: ["Fill in the form and press Add and get link. You get a private link to pass on, so they can choose their own password.", "Switch someone off if they should no longer have access."], tips: ["Staff can sell, add and edit pieces, and print labels. They can't see what a piece cost you, your customers' details, your sales totals or your settings."] },
  },
  {
    match: /^\/admin\/settings\/?$/,
    topic: {
      title: "Settings",
      about: "How your shop and website behave.",
      steps: ["Press Publish my website when you are ready for visitors to see it. Until then they see a Coming soon page.", "Change your business name, links and email addresses.", "Choose which payment methods the POS app offers."],
      tips: ["Sample data and the Setup Wizard are here too.", "“Your data and backups” shows your nightly backup and lets you download all your records.", "Press Save settings at the bottom after changing the other sections."],
    },
  },
  {
    match: /^\/admin\/guide\/staff\/?$/,
    topic: { title: "Quick start for staff", about: "One page on how to sell with the POS app.", steps: ["Press Print this page to keep a copy by the till."], tips: ["Give this to anyone who helps you at a market."] },
  },
  {
    match: /^\/admin\/guide\/market-day\/?$/,
    topic: { title: "Market day checklist", about: "Things to do before, during and after a market.", steps: ["Press Print this page, then tick things off with a pen."] },
  },
  {
    match: /^\/admin\/guide\/?$/,
    topic: { title: "Owner Guide", about: "How to run your shop and website, in plain words.", steps: ["Pick a part from the list at the top.", "Press Print the whole guide if you would like it on paper."], tips: ["The “?” button on each page explains that page as well."] },
  },
  {
    match: /^\/admin\/style-guide\/?$/,
    topic: { title: "Style guide", about: "A page for the developer showing the colours, fonts and artwork the website uses." },
  },
  {
    match: /^\/admin\/?$/,
    topic: {
      title: "Your dashboard",
      about: "How your shop looks today.",
      steps: ["The boxes count your pieces by status. Press one to see them.", "“Needs your attention” lists things to do, each with a button to fix it.", "Press Add a piece or Add an event to create one."],
      tips: ["Use the menu at the top to move around. The “?” button on every page explains that page."],
    },
  },
];

const FALLBACK: HelpTopic = {
  title: "Help",
  about: "Use the menu at the top to move around. Nothing is ever deleted: pieces and events are archived, and you can bring them back.",
};

export function helpFor(pathname: string): HelpTopic {
  const clean = pathname.split("?")[0] ?? pathname;
  return ROUTES.find((r) => r.match.test(clean))?.topic ?? FALLBACK;
}

export const HELP_TOPICS: readonly HelpTopic[] = ROUTES.map((r) => r.topic);

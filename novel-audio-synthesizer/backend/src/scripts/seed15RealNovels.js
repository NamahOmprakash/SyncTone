/**
 * SyncTone — 15 Real Literary Novels Database Seeder
 * Idempotently populates PostgreSQL and MongoDB with 15 verified published literary works,
 * complete with real bibliographic metadata, custom covers, character casts, and chapter prose.
 */

const { Pool } = require('pg');
const mongoose = require('mongoose');
const path = require('path');
const { config } = require('../config');
const ChapterModel = require('../models/Chapter');

const AUTHORS = [
  { name: 'J.K. Rowling', email: 'jk_rowling@synctone.internal' },
  { name: 'Arthur Conan Doyle', email: 'conan_doyle@synctone.internal' },
  { name: 'J.R.R. Tolkien', email: 'tolkien@synctone.internal' },
  { name: 'George Orwell', email: 'orwell@synctone.internal' },
  { name: 'F. Scott Fitzgerald', email: 'fitzgerald@synctone.internal' },
  { name: 'Jane Austen', email: 'austen@synctone.internal' },
  { name: 'Lewis Carroll', email: 'carroll@synctone.internal' },
  { name: 'Mary Shelley', email: 'shelley@synctone.internal' },
  { name: 'Bram Stoker', email: 'stoker@synctone.internal' },
  { name: 'Charlotte Brontë', email: 'bronte@synctone.internal' },
  { name: 'Herman Melville', email: 'melville@synctone.internal' },
  { name: 'Oscar Wilde', email: 'wilde@synctone.internal' },
  { name: 'Alexandre Dumas', email: 'dumas@synctone.internal' },
  { name: 'Antoine de Saint-Exupéry', email: 'saint_exupery@synctone.internal' },
];

const NOVELS = [
  {
    id: '203d59b1-fb72-4e47-b071-f83bc9e1ba44', // Preserve existing Harry Potter ID
    title: "Harry Potter and the Philosopher's Stone",
    author: 'J.K. Rowling',
    pub_year: 1997,
    genre: 'British Fantasy & Adventure',
    channel: 'verified',
    cover_object: '/static/covers/harry-potter-philosophers-stone-cover.webp',
    synopsis: "Harry Potter has never even heard of Hogwarts when the letters start dropping on the doormat at number four, Privet Drive. Addressed in green ink on yellowish parchment with a purple seal, they are swiftly confiscated by his aunt and uncle. Then, on Harry's eleventh birthday, a great beetle-eyed giant of a man called Rubeus Hagrid bursts in with some astonishing news: Harry Potter is a wizard, and he has a place at Hogwarts School of Witchcraft and Wizardry.",
    narrator_voice: 'en-GB-RyanNeural',
    narrator_name: 'British Narrator',
    chapter_title: 'Chapter 1: The Boy Who Lived',
    chapter_text: [
      { speaker: 'Narrator', type: 'narration', text: "Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal, thank you very much." },
      { speaker: 'Narrator', type: 'narration', text: "They were the last people you'd expect to be involved in anything strange or mysterious, because they just didn't hold with such nonsense." },
      { speaker: 'Mr. Dursley', type: 'dialogue', text: "Little tyke," },
      { speaker: 'Narrator', type: 'narration', text: "chortled Mr. Dursley as he left the house. He got into his car and backed out of number four's drive." },
      { speaker: 'Narrator', type: 'narration', text: "It was on the corner of the street that he noticed the first sign of something peculiar—a cat reading a map." },
      { speaker: 'Mr. Dursley', type: 'dialogue', text: "Shoo!" },
      { speaker: 'Narrator', type: 'narration', text: "said Mr. Dursley loudly. The cat didn't move. It just gave him a stern look." }
    ]
  },
  {
    id: '5748fd65-9de9-4678-8f6a-4bb22c6c280a', // Preserve existing Sherlock Holmes ID
    title: 'The Adventures of Sherlock Holmes',
    author: 'Arthur Conan Doyle',
    pub_year: 1892,
    genre: 'Victorian Detective Mystery',
    channel: 'verified',
    cover_object: '/static/covers/adventures-of-sherlock-holmes-cover.webp',
    synopsis: "A collection of twelve classic short stories featuring consulting detective Sherlock Holmes and his steadfast companion Dr. John Watson. Together they untangle intricate mysteries across Victorian society, beginning with 'A Scandal in Bohemia' where Holmes meets his match in the brilliant Irene Adler.",
    narrator_voice: 'bm_george',
    narrator_name: 'Dr. John Watson',
    chapter_title: 'A Scandal in Bohemia',
    chapter_text: [
      { speaker: 'Dr. John Watson', type: 'narration', text: "To Sherlock Holmes she is always THE woman. I have seldom heard him mention her under any other name." },
      { speaker: 'Dr. John Watson', type: 'narration', text: "In his eyes she eclipses and predominates the whole of her sex. It was not that he felt any emotion akin to love for Irene Adler." },
      { speaker: 'Sherlock Holmes', type: 'dialogue', text: "You see, my dear Watson, but you do not observe. The distinction is clear." },
      { speaker: 'Dr. John Watson', type: 'narration', text: "He paced rapidly up and down the room, his long thin hands twitching behind his back." },
      { speaker: 'Sherlock Holmes', type: 'dialogue', text: "A confederacy has been formed against the reigning King of Bohemia." }
    ]
  },
  {
    id: '14ee0456-ad37-4867-9190-938b0e7d14ad', // Preserve existing Study in Scarlet ID
    title: 'A Study in Scarlet',
    author: 'Arthur Conan Doyle',
    pub_year: 1887,
    genre: 'Victorian Detective Fiction',
    channel: 'verified',
    cover_object: '/static/covers/a-study-in-scarlet-cover.webp',
    synopsis: "The novel marks the first appearance of Sherlock Holmes and Dr. Watson, who meet through a mutual acquaintance seeking to share rooms at 221B Baker Street. Soon they are called to Lauriston Gardens to investigate an inexplicable murder where the word 'RACHE' is scrawled in blood on the wall.",
    narrator_voice: 'bm_george',
    narrator_name: 'Dr. John Watson',
    chapter_title: 'Chapter 1: Mr. Sherlock Holmes',
    chapter_text: [
      { speaker: 'Dr. John Watson', type: 'narration', text: "In the year 1878 I took my degree of Doctor of Medicine of the University of London, and proceeded to Netley to go through the course prescribed for surgeons in the army." },
      { speaker: 'Stamford', type: 'dialogue', text: "You don't know Sherlock Holmes yet; perhaps you would not care for him as a constant companion." },
      { speaker: 'Dr. John Watson', type: 'dialogue', text: "Why, what is there against him?" },
      { speaker: 'Stamford', type: 'dialogue', text: "Oh, I didn't say there was anything against him. He is a little queer in his ideas—an enthusiast in some branches of science." },
      { speaker: 'Sherlock Holmes', type: 'dialogue', text: "I've found it! I've found it! I have found a reagent which is precipitated by haemoglobin, and by nothing else!" }
    ]
  },
  {
    id: '5d46057b-247f-4c38-93a1-b0f8ad46a571', // Preserve existing Gatsby ID
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    pub_year: 1925,
    genre: 'Jazz Age Fiction & Tragedy',
    channel: 'verified',
    cover_object: '/static/covers/the-great-gatsby-cover.webp',
    synopsis: "Narrated by Nick Carraway, a Yale graduate who moves to West Egg, Long Island, the novel explores themes of decadence, idealism, and social upheaval during the Roaring Twenties. Across the bay sits the lavish estate of Jay Gatsby, whose extravagant parties mask his singular obsession with Nick's cousin, Daisy Buchanan.",
    narrator_voice: 'am_michael',
    narrator_name: 'Nick Carraway',
    chapter_title: 'Chapter 1: In My Younger and More Vulnerable Years',
    chapter_text: [
      { speaker: 'Nick Carraway', type: 'narration', text: "In my younger and more vulnerable years my father gave me some advice that I've been turning over in my mind ever since." },
      { speaker: "Nick's Father", type: 'dialogue', text: "Whenever you feel like criticizing anyone, just remember that all the people in this world haven't had the advantages that you've had." },
      { speaker: 'Nick Carraway', type: 'narration', text: "He didn't say any more, but we've always been unusually communicative in a reserved way, and I understood that he meant a great deal more than that." },
      { speaker: 'Nick Carraway', type: 'narration', text: "When I came back from the East last autumn I felt that I wanted the world to be in uniform and at a sort of moral attention forever." },
      { speaker: 'Daisy Buchanan', type: 'dialogue', text: "I'm p-paralyzed with happiness!" }
    ]
  },
  {
    id: 'c1110001-0000-4000-8000-000000000005',
    title: 'The Hobbit',
    author: 'J.R.R. Tolkien',
    pub_year: 1937,
    genre: 'Epic High Fantasy',
    channel: 'verified',
    cover_object: '/static/covers/the-hobbit-cover.webp',
    synopsis: "In a hole in the ground there lived a hobbit. Bilbo Baggins enjoys a comfortable, unambiguous life until the wizard Gandalf and a company of thirteen dwarves arrive on his doorstep. Led by Thorin Oakenshield, they embark on a dangerous journey through Wilderland to reclaim their ancestral home and treasure beneath the Lonely Mountain from the terrible dragon Smaug.",
    narrator_voice: 'bm_george',
    narrator_name: 'Narrator',
    chapter_title: 'Chapter 1: An Unexpected Party',
    chapter_text: [
      { speaker: 'Narrator', type: 'narration', text: "In a hole in the ground there lived a hobbit. Not a nasty, dirty, wet hole, filled with the ends of worms and an oozy smell, nor yet a dry, bare, sandy hole with nothing in it to sit down on or to eat: it was a hobbit-hole, and that means comfort." },
      { speaker: 'Narrator', type: 'narration', text: "It had a perfectly round door like a porthole, painted green, with a shiny yellow brass knob in the exact middle." },
      { speaker: 'Gandalf', type: 'dialogue', text: "Good morning!" },
      { speaker: 'Bilbo Baggins', type: 'dialogue', text: "What do you mean? Do you wish me a good morning, or mean that it is a good morning whether I want it or not?" },
      { speaker: 'Gandalf', type: 'dialogue', text: "All of them at once! And a very fine morning for a pipe of tobacco out of doors, into the bargain." }
    ]
  },
  {
    id: 'c1110001-0000-4000-8000-000000000006',
    title: '1984',
    author: 'George Orwell',
    pub_year: 1949,
    genre: 'Dystopian Political Fiction',
    channel: 'verified',
    cover_object: '/static/covers/1984-george-orwell-cover.webp',
    synopsis: "Set in Airstrip One, Oceania, in a world of perpetual war, omnipresent government surveillance, and historical negationism, Winston Smith works at the Ministry of Truth rewriting historical documents. Disillusioned with the totalitarian regime of Big Brother and the Thought Police, he begins an illicit diary and a forbidden romance with Julia.",
    narrator_voice: 'en-GB-RyanNeural',
    narrator_name: 'Narrator',
    chapter_title: 'Chapter 1: The Clocks Were Striking Thirteen',
    chapter_text: [
      { speaker: 'Narrator', type: 'narration', text: "It was a bright cold day in April, and the clocks were striking thirteen." },
      { speaker: 'Narrator', type: 'narration', text: "Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions, though not quickly enough to prevent a swirl of gritty dust from entering along with him." },
      { speaker: 'Narrator', type: 'narration', text: "The hallway smelt of boiled cabbage and old rag mats. At one end of it a colored poster, too large for indoor display, had been tacked to the wall." },
      { speaker: 'Narrator', type: 'narration', text: "It depicted simply an enormous face, more than a meter wide: the face of a man of about forty-five, with a heavy black mustache and ruggedly handsome features." },
      { speaker: 'Telescreen Voice', type: 'dialogue', text: "Big Brother is watching you." }
    ]
  },
  {
    id: 'c1110001-0000-4000-8000-000000000007',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    pub_year: 1813,
    genre: 'Regency Romance & Comedy',
    channel: 'verified',
    cover_object: '/static/covers/pride-and-prejudice-cover.webp',
    synopsis: "The spirited and quick-witted Elizabeth Bennet must contend with social expectations, financial instability, and the overbearing matchmaking of her mother. When the wealthy and aloof Fitzwilliam Darcy enters Hertfordshire society, Elizabeth quickly forms a negative opinion of him, setting off a classic battle of wit, pride, and growing mutual understanding.",
    narrator_voice: 'af_heart',
    narrator_name: 'Narrator',
    chapter_title: 'Chapter 1: A Truth Universally Acknowledged',
    chapter_text: [
      { speaker: 'Narrator', type: 'narration', text: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife." },
      { speaker: 'Narrator', type: 'narration', text: "However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters." },
      { speaker: 'Mrs. Bennet', type: 'dialogue', text: "My dear Mr. Bennet, have you heard that Netherfield Park is let at last?" },
      { speaker: 'Mr. Bennet', type: 'dialogue', text: "I have not." },
      { speaker: 'Mrs. Bennet', type: 'dialogue', text: "But it is; for Mrs. Long has just been here, and she told me all about it." }
    ]
  },
  {
    id: 'c1110001-0000-4000-8000-000000000008',
    title: "Alice's Adventures in Wonderland",
    author: 'Lewis Carroll',
    pub_year: 1865,
    genre: 'Literary Nonsense & Fantasy',
    channel: 'verified',
    cover_object: '/static/covers/alices-adventures-in-wonderland-cover.webp',
    synopsis: "On a golden afternoon, young Alice notices a talking White Rabbit checking a pocket watch and follows him down a rabbit hole into Wonderland. There she navigates shifts in scale, attends the Mad Hatter's tea party, plays croquet with the Queen of Hearts, and questions the arbitrary logic of adulthood.",
    narrator_voice: 'af_heart',
    narrator_name: 'Narrator',
    chapter_title: 'Chapter 1: Down the Rabbit-Hole',
    chapter_text: [
      { speaker: 'Narrator', type: 'narration', text: "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it." },
      { speaker: 'Alice', type: 'dialogue', text: "And what is the use of a book without pictures or conversations?" },
      { speaker: 'Narrator', type: 'narration', text: "Suddenly a White Rabbit with pink eyes ran close by her." },
      { speaker: 'White Rabbit', type: 'dialogue', text: "Oh dear! Oh dear! I shall be late!" },
      { speaker: 'Narrator', type: 'narration', text: "The Rabbit actually took a watch out of its waistcoat-pocket, and looked at it, and then hurried on." }
    ]
  },
  {
    id: 'c1110001-0000-4000-8000-000000000009',
    title: 'Frankenstein',
    author: 'Mary Shelley',
    pub_year: 1818,
    genre: 'Gothic Science Fiction',
    channel: 'verified',
    cover_object: '/static/covers/frankenstein-mary-shelley-cover.webp',
    synopsis: "Victor Frankenstein, a brilliant student of natural philosophy in Geneva, discovers the secret of imparting life to inanimate matter. Horrified by the grotesque countenance of the creature he constructs, Frankenstein abandons it. Rejected by humanity, the intelligent creature demands companionship and seeks vengeance against its creator across the frozen Arctic.",
    narrator_voice: 'am_adam',
    narrator_name: 'Victor Frankenstein',
    chapter_title: 'Chapter 1: Genevese Origins',
    chapter_text: [
      { speaker: 'Victor Frankenstein', type: 'narration', text: "I am by birth a Genevese, and my family is one of the most distinguished of that republic." },
      { speaker: 'Victor Frankenstein', type: 'narration', text: "My ancestors had been for many years counsellors and syndics, and my father had filled several public situations with honour and reputation." },
      { speaker: 'Victor Frankenstein', type: 'narration', text: "No human being could have passed a happier childhood than myself. My parents were possessed by the very spirit of kindness and indulgence." },
      { speaker: 'Victor Frankenstein', type: 'dialogue', text: "Natural philosophy is the genius that has regulated my fate." }
    ]
  },
  {
    id: 'c1110001-0000-4000-8000-000000000010',
    title: 'Dracula',
    author: 'Bram Stoker',
    pub_year: 1897,
    genre: 'Gothic Horror & Epistolary',
    channel: 'verified',
    cover_object: '/static/covers/dracula-bram-stoker-cover.webp',
    synopsis: "Told through journal entries, letters, and telegraphs, the story begins with young solicitor Jonathan Harker visiting Count Dracula's castle in the Carpathian Mountains. Harker barely escapes after discovering Dracula's vampiric nature. Soon, a ghost ship runs aground in Whitby, England, and Professor Abraham Van Helsing leads a desperate struggle to save humanity.",
    narrator_voice: 'bm_george',
    narrator_name: 'Jonathan Harker',
    chapter_title: "Chapter 1: Jonathan Harker's Journal",
    chapter_text: [
      { speaker: 'Jonathan Harker', type: 'narration', text: "3 May. Bistritz.—Left Munich at 8:35 P. M., on 1st May, arriving at Vienna early next morning; should have arrived at 6:46, but train was an hour late." },
      { speaker: 'Jonathan Harker', type: 'narration', text: "Buda-Pesth seems a wonderful place, from the glimpse which I got of it from the train and the little I could walk through the streets." },
      { speaker: 'Jonathan Harker', type: 'narration', text: "The impression I had was that we were leaving the West and entering the East; the most western of splendid bridges over the Danube brought us among the traditions of Turkish rule." },
      { speaker: 'Count Dracula', type: 'dialogue', text: "Welcome to my house! Enter freely and of your own will!" }
    ]
  },
  {
    id: 'c1110001-0000-4000-8000-000000000011',
    title: 'Jane Eyre',
    author: 'Charlotte Brontë',
    pub_year: 1847,
    genre: 'Victorian Gothic Romance',
    channel: 'verified',
    cover_object: '/static/covers/jane-eyre-cover.webp',
    synopsis: "An orphan raised by a resentful aunt and educated at the austere Lowood School, Jane Eyre secures employment as a governess at Thornfield Hall. There she falls deeply in love with the enigmatic master of the estate, Edward Rochester, only to uncover a devastating and dangerous secret hidden in the attic.",
    narrator_voice: 'af_heart',
    narrator_name: 'Jane Eyre',
    chapter_title: 'Chapter 1: Gateshead Hall',
    chapter_text: [
      { speaker: 'Jane Eyre', type: 'narration', text: "There was no possibility of taking a walk that day. We had been wandering, indeed, in the leafless shrubbery an hour in the morning; but since dinner the cold winter wind had brought with it clouds so sombre, and a rain so penetrating, that further outdoor exercise was now out of the question." },
      { speaker: 'Jane Eyre', type: 'narration', text: "I was glad of it: I never liked long walks, especially on chilly afternoons: dreadful to me was the coming home in the raw twilight, with nipped fingers and toes, and a heart saddened by the chidings of Bessie, the nurse." },
      { speaker: 'John Reed', type: 'dialogue', text: "What were you doing behind the curtain?" },
      { speaker: 'Jane Eyre', type: 'dialogue', text: "I was reading." }
    ]
  },
  {
    id: 'c1110001-0000-4000-8000-000000000012',
    title: 'Moby-Dick',
    author: 'Herman Melville',
    pub_year: 1851,
    genre: 'Epic Sea Adventure & Tragedy',
    channel: 'verified',
    cover_object: '/static/covers/moby-dick-cover.webp',
    synopsis: "\"Call me Ishmael.\" The epic journey of the whaling vessel Pequod, commanded by the monomaniacal Captain Ahab. Ahab is consumed by a fanatical desire to seek revenge on Moby Dick, the ferocious albino sperm whale that severed his leg on a previous voyage, driving his crew towards an inevitable maritime doom.",
    narrator_voice: 'am_michael',
    narrator_name: 'Ishmael',
    chapter_title: 'Chapter 1: Loomings',
    chapter_text: [
      { speaker: 'Ishmael', type: 'narration', text: "Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world." },
      { speaker: 'Ishmael', type: 'narration', text: "It is a way I have of driving off the spleen and regulating the circulation. Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul, then, I account it high time to get to sea as soon as I can." },
      { speaker: 'Captain Ahab', type: 'dialogue', text: "D'ye see him? Sing out for him, men! Look sharp for white water!" }
    ]
  },
  {
    id: 'c1110001-0000-4000-8000-000000000013',
    title: 'The Picture of Dorian Gray',
    author: 'Oscar Wilde',
    pub_year: 1890,
    genre: 'Decadent Gothic & Aestheticism',
    channel: 'verified',
    cover_object: '/static/covers/picture-of-dorian-gray-cover.webp',
    synopsis: "Enthralled by Lord Henry Wotton's hedonistic philosophy, the youthful Dorian Gray wishes that a stunning portrait painted by Basil Hallward would age in his place. As Dorian plunges into a life of unchecked decadence, cruelty, and double identity, his physical beauty remains unblemished, while the hidden painting transforms into a hideous reflection of his soul.",
    narrator_voice: 'bm_george',
    narrator_name: 'Narrator',
    chapter_title: 'Chapter 1: The Studio of Basil Hallward',
    chapter_text: [
      { speaker: 'Narrator', type: 'narration', text: "The studio was filled with the rich odour of roses, and when the light summer wind stirred amidst the trees of the garden, there came through the open door the heavy scent of the lilac, or the more delicate perfume of the pink-flowering thorn." },
      { speaker: 'Lord Henry Wotton', type: 'dialogue', text: "It is your best work, Basil, the best thing you have ever done. You must certainly send it next year to the Grosvenor." },
      { speaker: 'Basil Hallward', type: 'dialogue', text: "I don't think I shall send it anywhere. No, I can't explain it to you, Harry; I have put too much of myself into it." }
    ]
  },
  {
    id: 'c1110001-0000-4000-8000-000000000014',
    title: 'The Count of Monte Cristo',
    author: 'Alexandre Dumas',
    pub_year: 1844,
    genre: 'Historical Adventure & Revenge',
    channel: 'verified',
    cover_object: '/static/covers/count-of-monte-cristo-cover.webp',
    synopsis: "On the eve of his wedding and promotion to captain, young French sailor Edmond Dantès is falsely accused of treason by jealous rivals and imprisoned in the island fortress of the Château d'If. After fourteen years, he escapes with the guidance of Abbé Faria, locates an immense treasure on the island of Monte Cristo, and returns as a cultured, enigmatic count to dismantle his enemies.",
    narrator_voice: 'am_michael',
    narrator_name: 'Narrator',
    chapter_title: 'Chapter 1: Marseilles — The Arrival',
    chapter_text: [
      { speaker: 'Narrator', type: 'narration', text: "On the 24th of February, 1815, the look-out at Notre-Dame de la Garde signalled the three-master, the Pharaon, from Smyrna, Trieste, and Naples." },
      { speaker: 'Narrator', type: 'narration', text: "As usual, a pilot put off immediately, and rounding the Château d'If, got on board the vessel between Cape Morgiou and Rion island." },
      { speaker: 'M. Morrel', type: 'dialogue', text: "What has happened, and why does your ship bear an air of mourning?" },
      { speaker: 'Edmond Dantès', type: 'dialogue', text: "A great misfortune, sir! We lost our brave Captain Leclère off Civita Vecchia." }
    ]
  },
  {
    id: 'c1110001-0000-4000-8000-000000000015',
    title: 'The Little Prince',
    author: 'Antoine de Saint-Exupéry',
    pub_year: 1943,
    genre: 'Philosophical Fable',
    channel: 'verified',
    cover_object: '/static/covers/the-little-prince-cover.webp',
    synopsis: "Stranded in the Sahara desert with a crippled airplane, an aviator meets an extraordinary boy—the Little Prince—who has journeyed from his tiny asteroid, B 612. Through the Prince's encounters with a proud rose, a wise fox, and the bizarre adults of neighboring planets, the novella meditates on love, loss, and the timeless truth that 'what is essential is invisible to the eye.'",
    narrator_voice: 'af_heart',
    narrator_name: 'The Aviator',
    chapter_title: 'Chapter 1: The Boa Constrictor',
    chapter_text: [
      { speaker: 'The Aviator', type: 'narration', text: "Once when I was six years old I saw a magnificent picture in a book, called True Stories from Nature, about the primeval forest. It was a picture of a boa constrictor in the act of swallowing an animal." },
      { speaker: 'The Aviator', type: 'narration', text: "I pondered deeply, then, over the adventures of the jungle. And after some work with a colored pencil I succeeded in making my first drawing. My Drawing Number One." },
      { speaker: 'The Little Prince', type: 'dialogue', text: "If you please—draw me a sheep!" },
      { speaker: 'The Aviator', type: 'dialogue', text: "What!" },
      { speaker: 'The Little Prince', type: 'dialogue', text: "Draw me a sheep..." }
    ]
  }
];

async function seed() {
  console.log('=== Seeding 15 Real Literary Works into SyncTone Catalog ===');
  const pool = new Pool({ connectionString: config.databaseUrl });
  await mongoose.connect(config.mongoUri);
  console.log('✓ Connected to PostgreSQL and MongoDB');

  // 1. Ensure all 14 authors exist in `users`
  const authorMap = {};
  for (const author of AUTHORS) {
    const res = await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, 'writer')
       ON CONFLICT (email) DO UPDATE SET username = EXCLUDED.username
       RETURNING id, username`,
      [author.name, author.email, '$2b$10$wN7Kk5v7tH6aL5Q4m8N7Q.xL1M7y5v8X9p6Q3K7h8L9m0p1Q2r3t4']
    );
    authorMap[author.name] = res.rows[0].id;
  }
  console.log(`✓ Verified ${Object.keys(authorMap).length} real authors in users table.`);

  // 2. Insert/Update each of the 15 novels
  for (let i = 0; i < NOVELS.length; i++) {
    const item = NOVELS[i];
    const authorId = authorMap[item.author];

    // Upsert novel in PostgreSQL
    await pool.query(
      `INSERT INTO novels (id, added_by, title, synopsis, channel, status, global_tone, portfolio_source, cover_object)
       VALUES ($1, $2, $3, $4, $5, 'published', $6, 'manual', $7)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         synopsis = EXCLUDED.synopsis,
         channel = EXCLUDED.channel,
         status = 'published',
         global_tone = EXCLUDED.global_tone,
         cover_object = EXCLUDED.cover_object,
         added_by = EXCLUDED.added_by`,
      [item.id, authorId, item.title, item.synopsis, item.channel, item.genre, item.cover_object]
    );

    // Upsert Narrator Character
    await pool.query(
      `INSERT INTO characters (novel_id, canonical_name, gender, age_band, temperament, sample_quote, voice_id, is_narrator, source)
       VALUES ($1, $2, 'unknown', 'adult', 'calm and authoritative', 'Recorded for SyncTone Audio Classics.', $3, true, 'manual')
       ON CONFLICT (novel_id) WHERE is_narrator = true DO UPDATE SET
         canonical_name = EXCLUDED.canonical_name,
         voice_id = EXCLUDED.voice_id`,
      [item.id, item.narrator_name, item.narrator_voice]
    );

    // Upsert Chapter 1 in PostgreSQL
    const chRes = await pool.query(
      `INSERT INTO chapters (novel_id, chapter_number, title, status, total_duration_ms)
       VALUES ($1, 1, $2, 'completed', $3)
       ON CONFLICT (novel_id, chapter_number) DO UPDATE SET
         title = EXCLUDED.title,
         status = 'completed',
         total_duration_ms = EXCLUDED.total_duration_ms
       RETURNING id`,
      [item.id, item.chapter_title, item.chapter_text.length * 6000]
    );
    const pgChapterId = chRes.rows[0].id;

    // Build timeline and segments for MongoDB
    let currentMs = 0;
    const segments = item.chapter_text.map((t, idx) => {
      const dur = Math.max(4000, t.text.length * 65);
      const seg = {
        order: idx + 1,
        segment_id: idx + 1,
        type: t.type,
        text: t.text,
        speaker_name: t.speaker,
        character_id: t.speaker === item.narrator_name ? 'narrator' : t.speaker.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        voice_id: item.narrator_voice,
        start_ms: currentMs,
        end_ms: currentMs + dur,
      };
      currentMs += dur + 500;
      return seg;
    });

    const manifest = {
      novel_id: item.id,
      chapter_id: pgChapterId,
      audio_url: `/api/stream/${pgChapterId}`,
      audio_stream_url: `/api/stream/${pgChapterId}`,
      total_duration_ms: currentMs,
      timeline: segments.map((s) => ({
        segment_id: s.segment_id,
        order: s.order,
        start_ms: s.start_ms,
        end_ms: s.end_ms,
        speaker_name: s.speaker_name,
        character_id: s.character_id,
        voice_id: s.voice_id,
        text: s.text,
        type: s.type,
      })),
    };

    // Upsert MongoDB Chapter Document
    await ChapterModel.findOneAndUpdate(
      { pg_chapter_id: pgChapterId },
      {
        pg_chapter_id: pgChapterId,
        novel_id: item.id,
        chapter_number: 1,
        title: item.chapter_title,
        status: 'completed',
        total_duration_ms: currentMs,
        raw_text: item.chapter_text.map((t) => `${t.speaker}: ${t.text}`).join('\n\n'),
        segments,
        manifest,
      },
      { upsert: true, new: true }
    );

    console.log(`✓ [${String(i + 1).padStart(2, '0')}/15] "${item.title}" seeded with ${segments.length} prose segments.`);
  }

  await pool.end();
  await mongoose.disconnect();
  console.log('=== Seeding Complete: 15 Real Literary Works Ready in Catalog ===');
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});

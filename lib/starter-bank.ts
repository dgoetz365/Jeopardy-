// Imported only by the server route. Keep accepted responses out of client code.
import { blankBank, validateBank, type Bank } from './game';
import approved2026 from '../content/approved-2026.json';
import soundCheck from '../content/approved-sound-check.json';
import aroundTheWorld from '../content/approved-around-the-world.json';
import metsEasterEggs from '../content/approved-mets-easter-eggs.json';
import nameTheYear from '../content/approved-name-the-year.json';
import missingPiece from '../content/approved-missing-piece.json';
import behindTheBrand from '../content/approved-behind-the-brand.json';
import doubleTakes from '../content/approved-double-takes.json';
import flaggedForReview from '../content/approved-flagged-for-review.json';
import howMany from '../content/approved-how-many.json';
import theConnection from '../content/approved-the-connection.json';
import wrongAnswersOnly from '../content/approved-wrong-answers-only.json';
import approvedFinal from '../content/approved-final.json';

const categories = [
 approved2026, soundCheck, aroundTheWorld, metsEasterEggs, nameTheYear, missingPiece,
 behindTheBrand, doubleTakes, flaggedForReview, howMany, theConnection, wrongAnswersOnly,
];

/** All 60 owner-selected board clues and the owner-selected Final, editable by the host. */
export function starterBank(): Bank {
 const bank = blankBank();
 categories.forEach((entry, index) => {
  const round = Math.floor(index / 6), categoryIndex = index % 6;
  if (entry.round !== round + 1 || ('categoryIndex' in entry && entry.categoryIndex !== categoryIndex) || entry.approvedClues.length !== 5)
   throw new Error('Approved category order or size is invalid.');
  entry.approvedClues.forEach(clue => {
   const slot = bank.rounds[round].find(c => c.id === clue.id);
   if (!slot || slot.value !== clue.value || !clue.question.trim() || !clue.answer.trim())
    throw new Error('Approved clue is missing or in the wrong slot.');
   Object.assign(slot, {category: entry.category, question: clue.question, answer: clue.answer, source: 'source' in clue ? clue.source : ''});
  });
  bank.rounds[round].slice(categoryIndex * 5, categoryIndex * 5 + 5).forEach(c => {
   if (c.category !== entry.category || !c.question.trim() || !c.answer.trim())
    throw new Error('Approved category has an incomplete clue.');
  });
 });
 if (approvedFinal.status !== 'approved' || !approvedFinal.question.trim() || !approvedFinal.answer.trim())
  throw new Error('The approved Final Jeopardy clue is missing.');
 bank.final = {category: approvedFinal.category, question: approvedFinal.question, answer: approvedFinal.answer, source: approvedFinal.source};
 return validateBank(bank);
}

/** Fill untouched slots only; never overwrite host edits or existing rooms. */
export function fillStarterQuestions(existing: Bank): Bank {
 const next = structuredClone(existing), approved = starterBank();
 next.rounds.forEach((round, r) => round.forEach((clue, i) => {
  if (!clue.question.trim() && !clue.answer.trim() && !clue.source.trim() && clue.category === approved.rounds[r][i].category)
   Object.assign(clue, approved.rounds[r][i]);
 }));
 if (!next.final.question.trim() && !next.final.answer.trim() && !next.final.source.trim() && next.final.category === approved.final.category)
  next.final = structuredClone(approved.final);
 return next;
}

import { UInt32, Field } from 'snarkyjs';

import { Word, WordleRecursive } from './WordleRecursive.js';
import { tic, toc } from './tictoc.js';

tic('compiling');
await WordleRecursive.compile();
toc();

let solution = Word.fromString('hello');

// initialize (== create the first proof)
tic('prove (init)');
let initialProof = await WordleRecursive.init(); // <-- no class instantiation, just calling a function to create proof
toc();

console.log('Proof state initialized!');
console.log(
  'Initial guess: ' + initialProof.publicOutput.lastGuess.encodedWord.toString()
);

// to make a guess, a user would fetch the initial proof from a server, and then run this:

tic('prove (guess)');
let guess = Word.fromString('exile');
let userProof = await WordleRecursive.publishGuess(guess, initialProof);
toc();

console.log(
  'Valid guess: ' + userProof.publicOutput.lastGuess.encodedWord.toString()
);

// user would now post the userProof to the server, and wait for it to publish a hint in form of another proof

tic('prove (hint)');
let serverProof = await WordleRecursive.publishHint(solution, userProof);
toc();

console.log(
  'Guess with hints: ' +
    serverProof.publicOutput.lastGuess.encodedWord.toString()
);

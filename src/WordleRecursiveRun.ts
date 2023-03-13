import { isReady, UInt32, Field } from 'snarkyjs';

import {
  Word,
  WordleRecursive,
  WordleHelper,
  WordleState,
} from './WordleRecursive.js';
import { tic, toc } from './tictoc.js';

await isReady;

tic('compiling');
await WordleRecursive.compile();
toc();

let solution = Word.fromString('hello');

// initialize (== create the first proof)
tic('prove (init)');
let initialState = WordleHelper.init();
let initialProof = await WordleRecursive.init(initialState); // <-- no class instantiation, just calling a function to create proof
toc();

console.log('Proof state initialized!');

// to make a guess, a user would fetch the initial proof from a server, and then run this:

tic('prove (guess)');
let guess = Word.fromString('exile');
let userState = WordleHelper.publishGuess(guess, initialProof);
let userProof = await WordleRecursive.publishGuess(
  userState,
  guess,
  initialProof
);
toc();

console.log('Guess Valid!');

// user would now post the userProof to the server, and wait for it to publish a hint in form of another proof

tic('prove (hint)');
let serverState =
  WordleHelper.publishHint(solution, userProof) ??
  new WordleState({
    solutionHash: Word.fromString('hello').hash(),
    turnNumber: new UInt32(Field(2)),
    lastGuess: Word.fromString('exile'),
  });
let serverProof = await WordleRecursive.publishHint(
  serverState,
  solution,
  userProof
);
toc();

console.log('Guess with hints: ' + serverProof.publicInput.lastGuess);

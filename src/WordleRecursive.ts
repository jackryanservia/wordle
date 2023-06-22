import {
  SelfProof,
  Field,
  Experimental,
  Struct,
  UInt32,
  Poseidon,
  Circuit,
} from 'snarkyjs';

export class Word extends Struct({
  encodedWord: [Field, Field, Field, Field, Field],
}) {
  static fromString(word: string) {
    const lowerCaseWord = word.toLowerCase();

    let encodedWord = [];
    for (let i = 0; i < 5; i++) {
      // Test if character is lowercase letter
      if (/^[a-z]+$/.test(lowerCaseWord[i]) === true) {
        encodedWord.push(Field(word.charCodeAt(i) - 96));
      } else {
        // If character is not lowercase letter push 1 value (an 'a' character)
        encodedWord.push(Field(1));
      }
    }
    return new Word({ encodedWord });
  }

  hash() {
    return Poseidon.hash(this.encodedWord);
  }
}

export class WordleState extends Struct({
  solutionHash: Field,
  turnNumber: UInt32,
  lastGuess: Word,
}) {}

export const WordleRecursive = Experimental.ZkProgram({
  publicOutput: WordleState,

  methods: {
    init: {
      privateInputs: [],
      method() {
        // no checks here, just producing the initial state
        return new WordleState({
          // Set the solution to the word 'hello'
          solutionHash: Word.fromString('hello').hash(),
          // Set the turn number to zero
          turnNumber: new UInt32(Field(0)),
          // Set the inital guess to 'aaaaa'
          // It won't be possible to generate a hint until the guesser updates this
          lastGuess: Word.fromString('aaaaa'),
        });
      },
    },

    publishGuess: {
      privateInputs: [Word, SelfProof],

      method(guess: Word, previousProof: SelfProof<undefined, WordleState>) {
        previousProof.verify();

        // Check that it is the guessers turn
        previousProof.publicOutput.turnNumber
          .mod(2)
          .assertEquals(new UInt32(Field(0)));

        // Check that all guess values are between 1 and 26 (valid letter configuration)
        for (let i = 0; i < 5; i++) {
          guess.encodedWord[i].assertGreaterThanOrEqual(Field(1));
          guess.encodedWord[i].assertLessThanOrEqual(Field(26));
        }

        return new WordleState({
          // Pass solutionHash through unchanged
          solutionHash: previousProof.publicOutput.solutionHash,
          // Increment turnNumber
          turnNumber: previousProof.publicOutput.turnNumber.add(1),
          // Update guess
          lastGuess: guess,
        });
      },
    },

    publishHint: {
      privateInputs: [Word, SelfProof],

      method(solution: Word, previousProof: SelfProof<undefined, WordleState>) {
        previousProof.verify();

        // Add one and mod to check if it is hint generators turn
        previousProof.publicOutput.turnNumber
          .add(1)
          .mod(2)
          .assertEquals(new UInt32(Field(0)));

        // Grab solution hash from the Mina network
        const solutionHash = previousProof.publicOutput.solutionHash;

        // Check that the solution we provide matches the one on-chain
        solutionHash.assertEquals(solution.hash());

        // Grab lastGuess from the Mina network
        const lastGuess = previousProof.publicOutput.lastGuess;

        // Check green letters
        // Iterate thorough every index
        for (let i = 0; i < 5; i++) {
          // Check if the letters at this index match
          let isCorrectPosition = lastGuess.encodedWord[i].equals(
            solution.encodedWord[i]
          );

          // If the letters match then add 200 to the letter in lastGuess
          lastGuess.encodedWord[i] = Circuit.if(
            isCorrectPosition,
            lastGuess.encodedWord[i].add(Field(200)),
            lastGuess.encodedWord[i]
          );
        }

        // Add yellow letter hints
        // Iterate through every possible combination of indexes
        for (let i = 0; i < 5; i++) {
          for (let j = 0; j < 5; j++) {
            // Check if the letters at these indexes match
            let doseLetterMatch = lastGuess.encodedWord[i].equals(
              solution.encodedWord[j]
            );

            // If the letters match then add 100 to the letter in lastGuess
            lastGuess.encodedWord[i] = Circuit.if(
              doseLetterMatch,
              lastGuess.encodedWord[i].add(Field(100)),
              lastGuess.encodedWord[i]
            );

            // If the letters match then set the value in solution to zero
            // This way we only count correct letters in the wrong position once
            solution.encodedWord[j] = Circuit.if(
              doseLetterMatch,
              Field(0),
              solution.encodedWord[i]
            );
          }
        }

        return new WordleState({
          // Pass solutionHash through unchanged
          solutionHash: previousProof.publicOutput.solutionHash,
          // Increment turnNumber
          turnNumber: previousProof.publicOutput.turnNumber.add(1),
          // Update guess to reflect added hints
          lastGuess: lastGuess,
        });
      },
    },
  },
});

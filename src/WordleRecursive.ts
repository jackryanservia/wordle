import {
  SelfProof,
  Field,
  Experimental,
  verify,
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
    for (var i = 0; i < 5; i++) {
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
  publicInput: WordleState,

  methods: {
    init: {
      privateInputs: [],
      method(publicInput: WordleState) {
        // Set the solution to the word 'hello'
        publicInput.solutionHash.assertEquals(Word.fromString('hello').hash());
        // Set the turn number to zero
        publicInput.turnNumber.assertEquals(new UInt32(Field(0)));
        // Set the inital guess to 'aaaaa'
        // It won't be possible to generate a hint until the guesser updates this
        for (let i = 0; i < 5; i++) {
          publicInput.lastGuess.encodedWord[i].assertEquals(Field(1));
        }
      },
    },

    publishGuess: {
      privateInputs: [Word, SelfProof],

      method(
        publicInput: WordleState,
        guess: Word,
        previouseProof: SelfProof<WordleState>
      ) {
        previouseProof.verify();

        const turnNumber = previouseProof.publicInput.turnNumber;

        // Check that it is the guessers turn
        turnNumber.mod(2).assertEquals(new UInt32(Field(0)));
        // Increment the turn number
        publicInput.turnNumber.assertEquals(
          turnNumber.add(new UInt32(Field(1)))
        );

        // Check that all values are between 1 and 26 (valid letter configuration)
        for (let i = 0; i < 5; i++) {
          guess.encodedWord[i].assertGte(Field(1));
          guess.encodedWord[i].assertLte(Field(26));
        }

        // Set lastGuess to new guess
        for (let i = 0; i < 5; i++) {
          publicInput.lastGuess.encodedWord[i].assertEquals(
            guess.encodedWord[i]
          );
        }
      },
    },

    publishHint: {
      privateInputs: [Word, SelfProof],

      method(
        publicInput: WordleState,
        solution: Word,
        previouseProof: SelfProof<WordleState>
      ) {
        previouseProof.verify();

        const turnNumber = previouseProof.publicInput.turnNumber;

        // Add one and mod to check if it is hint generators turn
        turnNumber
          .add(1)
          .mod(2)
          .assertEquals(new UInt32(Field(0)));
        // Increment the turn number
        publicInput.turnNumber.assertEquals(
          turnNumber.add(new UInt32(Field(1)))
        );

        // Grab solution hash from the Mina network
        const solutionHash = previouseProof.publicInput.solutionHash;

        // Check that the solution we provide matches the one on-chain
        solutionHash.assertEquals(solution.hash());

        // Grab lastGuess from the Mina network
        const lastGuess = previouseProof.publicInput.lastGuess;

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

        // Set lastGuess to our new lastGuess which includes hints
        for (let i = 0; i < 5; i++) {
          publicInput.lastGuess.encodedWord[i].assertEquals(
            lastGuess.encodedWord[i]
          );
        }
      },
    },
  },
});

export const WordleHelper = {
  init() {
    // no checks here, just producing the initial state
    return new WordleState({
      solutionHash: Word.fromString('hello').hash(),
      turnNumber: new UInt32(Field(0)),
      lastGuess: Word.fromString('aaaaa'),
    });
  },

  publishGuess(
    guess: Word, // as before
    previousProof: SelfProof<WordleState> // RECURSION!!!
  ) {
    return new WordleState({
      ...previousProof.publicInput,
      // Increment the turn number
      turnNumber: previousProof.publicInput.turnNumber.add(UInt32.one),
      // Set lastGuess to new guess
      lastGuess: guess,
    });
  },

  publishHint(solution: Word, previousProof: SelfProof<WordleState>) {
    const solutionHash = previousProof.publicInput.solutionHash;

    const lastGuess = previousProof.publicInput.lastGuess;

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

      return new WordleState({
        ...previousProof.publicInput,
        turnNumber: previousProof.publicInput.turnNumber.add(
          new UInt32(Field(1))
        ),
        lastGuess,
      });
    }
  },
};

import {
  Field,
  SmartContract,
  state,
  State,
  method,
  Struct,
  Circuit,
  Poseidon,
  UInt32,
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

export class Wordle extends SmartContract {
  @state(Field) solutionHash = State<Field>();
  @state(UInt32) turnNumber = State<UInt32>();
  @state(Word) lastGuess = State<Word>();

  init() {
    super.init();
    // Set the solution to the word 'hello'
    this.solutionHash.set(Word.fromString('hello').hash());
    // Set the turn number to zero
    this.turnNumber.set(new UInt32(Field(0)));
    // Set the inital guess to 'aaaaa'
    // It won't be possible to generate a hint until the guesser updates this
    this.lastGuess.set(Word.fromString('aaaaa'));
  }

  @method publishGuess(guess: Word) {
    // Grab turnNumber from the Mina network
    let turnNumber = this.turnNumber.get();
    this.turnNumber.assertEquals(turnNumber);

    // Check that it is the guessers turn
    turnNumber.mod(2).assertEquals(new UInt32(Field(0)));
    // Increment the turn number
    this.turnNumber.set(turnNumber.add(new UInt32(Field(1))));

    // Check that all values are between 1 and 26 (valid letter configuration)
    for (let i = 0; i < 5; i++) {
      guess.encodedWord[i].assertGte(Field(1));
      guess.encodedWord[i].assertLte(Field(26));
    }

    // Set lastGuess to new guess
    this.lastGuess.set(guess);
  }

  @method publishHint(solution: Word) {
    // Grab turnNumber from the Mina network
    let turnNumber = this.turnNumber.get();
    this.turnNumber.assertEquals(turnNumber);

    // Add one and mod to check if it is hint generators turn
    turnNumber
      .add(1)
      .mod(2)
      .assertEquals(new UInt32(Field(0)));
    // Increment the turn number
    this.turnNumber.set(turnNumber.add(new UInt32(Field(1))));

    // Grab solution hash from the Mina network
    const solutionHash = this.solutionHash.get();
    this.solutionHash.assertEquals(solutionHash);

    // Check that the solution we provide matches the one on-chain
    solutionHash.assertEquals(solution.hash());

    // Grab lastGuess from the Mina network
    const lastGuess = this.lastGuess.get();
    this.lastGuess.assertEquals(lastGuess);

    // Add green letter hints
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
    this.lastGuess.set(lastGuess);
  }
}

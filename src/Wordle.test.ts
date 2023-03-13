import { Wordle, Word } from './Wordle';
import {
  isReady,
  shutdown,
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  UInt32,
} from 'snarkyjs';

let proofsEnabled = false;

describe('Wordle', () => {
  let deployerAccount: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkApp: Wordle;

  beforeAll(async () => {
    await isReady;
    if (proofsEnabled) Wordle.compile();
  });

  beforeEach(() => {
    const Local = Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);
    deployerAccount = Local.testAccounts[0].privateKey;
    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
    zkApp = new Wordle(zkAppAddress);
  });

  afterAll(() => {
    // `shutdown()` internally calls `process.exit()` which will exit the running Jest process early.
    // Specifying a timeout of 0 is a workaround to defer `shutdown()` until Jest is done running all tests.
    // This should be fixed with https://github.com/MinaProtocol/mina/issues/10943
    setTimeout(shutdown, 0);
  });

  async function localDeploy() {
    const txn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkApp.deploy();
    });
    await txn.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn.sign([zkAppPrivateKey]).send();
  }

  it('generates and deploys the `Wordle` smart contract', async () => {
    await localDeploy();

    const solutionHash = zkApp.solutionHash.get();
    const turnNumber = zkApp.turnNumber.get();
    const guess = zkApp.lastGuess.get();

    // Big number is hash of 'hello'
    expect(solutionHash).toEqual(
      Field(
        9485688726359126538350995376745161242441617640699010782093157294130968089000n
      )
    );
    expect(turnNumber).toEqual(new UInt32(Field(0)));
    // Field array for 'aaaaa'
    expect(guess.encodedWord).toEqual([
      Field(1),
      Field(1),
      Field(1),
      Field(1),
      Field(1),
    ]);
  });

  it('correctly updates the guess state on the `Wordle` smart contract when player submits guess', async () => {
    await localDeploy();

    const txn = await Mina.transaction(deployerAccount, () => {
      const exile = Word.fromString('exile');
      zkApp.publishGuess(exile);
    });
    await txn.prove();
    await txn.send();

    const updatedGuess = zkApp.lastGuess.get();
    const turnNumber = zkApp.turnNumber.get();

    expect(turnNumber).toEqual(new UInt32(Field(1)));
    // Field array for 'exile'
    expect(updatedGuess.encodedWord).toEqual([
      Field(5),
      Field(24),
      Field(9),
      Field(12),
      Field(5),
    ]);
  });

  it('correctly updates the guess state on the `Wordle` smart contract when hint generator submits hint', async () => {
    await localDeploy();

    const txn1 = await Mina.transaction(deployerAccount, () => {
      const exile = Word.fromString('exile');
      zkApp.publishGuess(exile);
    });
    await txn1.prove();
    await txn1.send();

    const turnNumber1 = zkApp.turnNumber.get();
    const updatedGuess1 = zkApp.lastGuess.get();

    expect(turnNumber1).toEqual(new UInt32(Field(1)));
    // Field array for 'exile'
    expect(updatedGuess1.encodedWord).toEqual([
      Field(5),
      Field(24),
      Field(9),
      Field(12),
      Field(5),
    ]);

    const txn2 = await Mina.transaction(deployerAccount, () => {
      const hello = Word.fromString('hello');
      zkApp.publishHint(hello);
    });
    await txn2.prove();
    await txn2.send();

    const turnNumber2 = zkApp.turnNumber.get();
    const updatedGuess2 = zkApp.lastGuess.get();

    expect(turnNumber2).toEqual(new UInt32(Field(2)));
    // Field array for 'exile' with valid hints
    expect(updatedGuess2.encodedWord).toEqual([
      Field(105),
      Field(24),
      Field(9),
      Field(212),
      Field(5),
    ]);
  });

  it('correctly runs through example game on the `Wordle` smart contract', async () => {
    await localDeploy();

    const txn1 = await Mina.transaction(deployerAccount, () => {
      const exile = Word.fromString('exile');
      zkApp.publishGuess(exile);
    });
    await txn1.prove();
    await txn1.send();

    const turnNumber1 = zkApp.turnNumber.get();
    const updatedGuess1 = zkApp.lastGuess.get();

    expect(turnNumber1).toEqual(new UInt32(Field(1)));
    // Field array for 'exile'
    expect(updatedGuess1.encodedWord).toEqual([
      Field(5),
      Field(24),
      Field(9),
      Field(12),
      Field(5),
    ]);

    console.log('Word: exile');
    console.log('Turn number: ' + turnNumber1.toString());
    console.log('Last Guess: ' + updatedGuess1.encodedWord.toString());

    const txn2 = await Mina.transaction(deployerAccount, () => {
      const hello = Word.fromString('hello');
      zkApp.publishHint(hello);
    });
    await txn2.prove();
    await txn2.send();

    const turnNumber2 = zkApp.turnNumber.get();
    const updatedGuess2 = zkApp.lastGuess.get();

    expect(turnNumber2).toEqual(new UInt32(Field(2)));
    // Field array for 'exile' with valid hints
    expect(updatedGuess2.encodedWord).toEqual([
      Field(105),
      Field(24),
      Field(9),
      Field(212),
      Field(5),
    ]);

    console.log('Word: exile');
    console.log('Turn number: ' + turnNumber2.toString());
    console.log('Last Guess: ' + updatedGuess2.encodedWord.toString());

    const txn3 = await Mina.transaction(deployerAccount, () => {
      const hello = Word.fromString('hello');
      zkApp.publishGuess(hello);
    });
    await txn3.prove();
    await txn3.send();

    const turnNumber3 = zkApp.turnNumber.get();
    const updatedGuess3 = zkApp.lastGuess.get();

    expect(turnNumber3).toEqual(new UInt32(Field(3)));
    // Field array for 'hello'
    expect(updatedGuess3.encodedWord).toEqual([
      Field(8),
      Field(5),
      Field(12),
      Field(12),
      Field(15),
    ]);

    console.log('Word: hello');
    console.log('Turn number: ' + turnNumber3.toString());
    console.log('Last Guess: ' + updatedGuess3.encodedWord.toString());

    const txn4 = await Mina.transaction(deployerAccount, () => {
      const hello = Word.fromString('hello');
      zkApp.publishHint(hello);
    });
    await txn4.prove();
    await txn4.send();

    const turnNumber4 = zkApp.turnNumber.get();
    const updatedGuess4 = zkApp.lastGuess.get();

    expect(turnNumber4).toEqual(new UInt32(Field(4)));
    // Field array for 'hello' with valid hints
    expect(updatedGuess4.encodedWord).toEqual([
      Field(208),
      Field(205),
      Field(212),
      Field(212),
      Field(215),
    ]);

    console.log('Word: hello');
    console.log('Turn number: ' + turnNumber4.toString());
    console.log('Last Guess: ' + updatedGuess4.encodedWord.toString());
  });
});

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Ballot } from "../typechain";
import { blockTimestamp, skipTime } from "./utils";

describe("Ballot", () => {
  let ballot: Ballot | null = null;
  let [deployer, user1, user2, user3]: (SignerWithAddress | null)[] = [
    null,
    null,
    null,
    null,
  ];

  beforeEach(async () => {
    [deployer, user1, user2, user3] = await ethers.getSigners();

    const Ballot = await ethers.getContractFactory("Ballot");
    ballot = await Ballot.deploy();
    ballot.deployed();
  }),
    describe("createSession", () => {
      it("Check chairperson", async () => {
        await expect(
          ballot!.createSession(
            ethers.constants.AddressZero,
            2,
            (await blockTimestamp()) + 10000,
            (await blockTimestamp()) + 30000
          )
        ).revertedWith("Invalid chairperson");
      });

      it("Check candidate count", async () => {
        await expect(
          ballot!.createSession(
            user1!.address,
            0,
            (await blockTimestamp()) + 10000,
            (await blockTimestamp()) + 30000
          )
        ).revertedWith("No one to vote");
        await expect(
          ballot!.createSession(
            user1!.address,
            1001,
            (await blockTimestamp()) + 10000,
            (await blockTimestamp()) + 30000
          )
        ).revertedWith("Exeeded max of candidates");
      });

      it("Check time", async () => {
        await expect(
          ballot!.createSession(
            user1!.address,
            2,
            (await blockTimestamp()) - 1,
            (await blockTimestamp()) + 30000
          )
        ).revertedWith("Invalid session time");
        await expect(
          ballot!.createSession(
            user1!.address,
            2,
            (await blockTimestamp()) + 30000,
            (await blockTimestamp()) + 10000
          )
        ).revertedWith("Invalid session time");
      });

      it("Should be success", async () => {
        const startTime = (await blockTimestamp()) + 10000;
        const endTime = (await blockTimestamp()) + 30000;

        await ballot!.createSession(user1!.address, 2, startTime, endTime);

        const lastSessionId = await ballot!.lastSessionId();
        const session = await ballot!.sessions(lastSessionId);

        expect(lastSessionId).to.equal(1, "Invalid last session id");
        expect(session.chairperson).to.equal(
          user1!.address,
          "Invalid chairperson"
        );
        expect(session.startTime).to.equal(startTime, "Invalid start time");
        expect(session.endTime).to.equal(endTime, "Invalid end time");
      });
    });

  describe("giveRightToVote", () => {
    it("Check sesion id", async () => {
      await expect(ballot!.giveRightToVote(10, [user1!.address])).revertedWith(
        "Invalid Session ID"
      );
    });

    it("Check sesion status", async () => {
      const startTime = (await blockTimestamp()) + 10000;
      const endTime = (await blockTimestamp()) + 30000;

      await ballot!.createSession(user1!.address, 2, startTime, endTime);
      await skipTime(20000);
      await expect(ballot!.giveRightToVote(1, [user1!.address])).revertedWith(
        "Invalid status"
      );
    });

    it("Only chairperson", async () => {
      const startTime = (await blockTimestamp()) + 10000;
      const endTime = (await blockTimestamp()) + 30000;

      await ballot!.createSession(user1!.address, 2, startTime, endTime);
      await expect(
        ballot!.connect(user2!).giveRightToVote(1, [user1!.address])
      ).revertedWith("Invalid chairperson");
    });

    it("Should be successful", async () => {
      const startTime = (await blockTimestamp()) + 10000;
      const endTime = (await blockTimestamp()) + 30000;

      await ballot!.createSession(user1!.address, 2, startTime, endTime);
      await ballot!.connect(user1!).giveRightToVote(1, [user1!.address]);

      const voter = await ballot!.getVoterFromSession(1, user1!.address);

      expect(voter.candidateId).to.equal(0, "Invalid candidate ID");
      expect(voter.isVoted).to.equal(false, "Should be hasn't voted");
      expect(voter.delegated).to.equal(
        ethers.constants.AddressZero,
        "Hasn't delegated yet"
      );
      expect(voter.weight).to.equal("1", "Invalid weight");
    });
  });

  describe.only("vote", async () => {
    it("Check sesion id", async () => {
      await expect(ballot!.vote(10, 1)).revertedWith("Invalid Session ID");
    });

    it("Check sesion status", async () => {
      const startTime = (await blockTimestamp()) + 10000;
      const endTime = (await blockTimestamp()) + 30000;

      await ballot!.createSession(user1!.address, 2, startTime, endTime);
      await expect(ballot!.vote(1, 0)).revertedWith("Invalid status");
      await skipTime(30000);
      await expect(ballot!.vote(1, 0)).revertedWith("Invalid status");
    });

    it("Check weight", async () => {
      const startTime = (await blockTimestamp()) + 10000;
      const endTime = (await blockTimestamp()) + 30000;

      await ballot!.createSession(user1!.address, 2, startTime, endTime);
      await ballot!.connect(user1!).giveRightToVote(1, [user1!.address]);
      await skipTime(20000);
      await expect(ballot!.connect(user2!).vote(1, 0)).revertedWith(
        "No right to vote"
      );
    });

    it("Check double voting", async () => {
      const startTime = (await blockTimestamp()) + 10000;
      const endTime = (await blockTimestamp()) + 30000;

      await ballot!.createSession(user1!.address, 2, startTime, endTime);
      await ballot!.connect(user1!).giveRightToVote(1, [user2!.address]);
      await skipTime(20000);
      await ballot!.connect(user2!).vote(1, 0);
      await expect(ballot!.connect(user2!).vote(1, 1)).to.equal(
        "Already voted"
      );
    });

    it("Should be successfull", async () => {
      const startTime = (await blockTimestamp()) + 10000;
      const endTime = (await blockTimestamp()) + 30000;

      await ballot!.createSession(user1!.address, 2, startTime, endTime);
      await ballot!.connect(user1!).giveRightToVote(1, [user2!.address]);
      await skipTime(20000);
      await ballot!.connect(user2!).vote(1, 0);

      const voter = await ballot!.getVoterFromSession(1, user2!.address);
      const candidates = await ballot!.getCandidatesFromSession(1);

      expect(voter.candidateId).to.equal(0, "Invalid candidate ID");
      expect(voter.delegated).to.equal(
        ethers.constants.AddressZero,
        "Invalid delegated"
      );
      expect(voter.isVoted).to.equal(true, "Invalid is voted");
      expect(voter.weight).to.equal(1, "Invalid weight");
      expect(voter.candidateId).to.equal(0, "Invalid candidate ID");
      expect(candidates[0].voteCount).to.equal(1, "Invalid vote count");
    });
  });
});

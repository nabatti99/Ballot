//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

contract Ballot {
	struct Voter {
		bool isVoted;
		address delegated;
		uint256 weight;
		uint256 candidateId;
	}

	struct Candidate {
		uint256 id;
		uint256 voteCount;
	}

	struct Session {
		address chairperson;
		uint256 startTime;
		uint256 endTime;
		Candidate[] candidates;
		mapping(address => Voter) voters;
	}

	/**
	 *  Status of a session
	 *
	 *  Definition                                  |Value
	 *  --------------------------------------------|---------
	 *  Ballot Session is not started               |PENDDING
	 *  Ballot Session is conducting                |VOTING
	 *  Ballot Session is ended                     |DONE
	 */
	enum Status {
		PENDDING,
		VOTING,
		DONE
	}

	// Help to prevent run out of gas when using loop
	uint256 public constant MAX_LOOP = 10000;

	// The latest requested payment ID started by 1
	uint256 public lastSessionId;

	// Mapping session ID to a session
	mapping(uint256 => Session) public sessions;

	// -----------Modifiers-----------

	/**
	 * @notice Ensure that the Session ID is valid.
	 *
	 * @param sessionId Session ID to check
	 */
	modifier validSession(uint256 sessionId) {
		require(sessionId <= lastSessionId && sessionId != 0, "Invalid Session ID");
		_;
	}

	/**
	 * @notice Ensure that users can do allowed action followed by Ballot Session status.
	 *
	 * @param sessionId Session ID to get status
	 * @param status Status to check
	 */
	modifier checkSessionStatus(uint256 sessionId, Status status) {
		Status sessionStatus = getSessionStatus(sessionId);
		require(status == sessionStatus, "Invalid status");
		_;
	}

	/**
	 * @notice Ensure that action can only be done by chairperson.
	 *
	 * @param sessionId Session ID to check chairperson
	 */
	modifier onlyChairperson(uint256 sessionId) {
		require(msg.sender == sessions[sessionId].chairperson, "Invalid chairperson");
		_;
	}

	/**
	 * @notice Ensure that contract addresses is not allowed.
	 *
	 * @param addrs Addresses to check
	 */
	modifier disallowedContractAddresses(address[] memory addrs) {
		for (uint i = 0; i < addrs.length; i++) {
			uint16 size;
			address addr = addrs[i];
			assembly {
				size := extcodesize(addr)
			}
			require(size == 0, "Contract address is disallowed");
		}
		_;
	}

	/**
	 * @notice Ensure that contract address is not allowed.
	 *
	 * @param addr Address to check
	 */
	modifier disallowedContractAddress(address addr) {
		uint16 size;
		assembly {
			size := extcodesize(addr)
		}
		require(size == 0, "Contract address is disallowed");
		_;
	}

	// -----------External Functions-----------

	/**
	 *  @dev    Make new Ballot Session.
	 *
	 *  @param  chairperson   Creator of Ballot Session
	 *  @param  startTime     Ballot's start time
	 *  @param  endTime       Ballot's end time
	 */
	function createSession(
		address chairperson,
		uint256 startTime,
		uint256 endTime
	) external disallowedContractAddress(chairperson) {
		require(chairperson != address(0), "Invalid chairperson");
		require(startTime > block.timestamp && endTime > startTime, "Invalid session time");

		lastSessionId++;
		Session storage session = sessions[lastSessionId];
		session.chairperson = chairperson;
		session.startTime = startTime;
		session.endTime = endTime;
	}

  function addCandidate(uint256 sessionId, uint256 candidateId) external validSession(sessionId) onlyChairperson(sessionId) {
    require(candidateId > 0, "Invalid candidate id");

    Session storage session = sessions[sessionId];
    for (uint16 i = 0; i < session.candidates.length; i++) {
      require(session.candidates[i].id != candidateId, "This candidate has already existed");
    }
    session.candidates.push(Candidate({ id: candidateId, voteCount: 0 }));
  }

	function getVoterFromSession(uint256 sessionId, address voterAddress) external view validSession(sessionId) returns (Voter memory) {
		return sessions[sessionId].voters[voterAddress];
	}

	function getCandidatesFromSession(uint256 sessionId) external view validSession(sessionId) returns (Candidate[] memory) {
		return sessions[sessionId].candidates;
	}

	/**
	 *  @dev    Give voters right to vote.
	 *
	 *  @notice Action must be done when the state of Status is PENDDING
	 *          Only chairperson can do it
	 *          Any of voters must not be contract addresses
	 *          Number of voters must be less or equal than MAX_LOOP
	 *
	 *  @param  sessionId     Session ID of a Ballot Session
	 *  @param  voters        Voters to give right
	 */
	function giveRightToVote(uint256 sessionId, address[] memory voters) external validSession(sessionId) onlyChairperson(sessionId) disallowedContractAddresses(voters) {
		require(voters.length <= MAX_LOOP, "Voters count is too big");

		Session storage session = sessions[sessionId];

		for (uint16 i = 0; i < voters.length; ++i) {
			address voter = voters[i];
			require(session.voters[voter].weight == 0, "Already had right");

			session.voters[voter].weight = 1;
		}
	}

	/**
	 *  @dev    Delegate vote to another person.
	 *
	 *  @notice Action must be done when the state of Status is VOTING
	 *          receiver must not be a contract address
	 *          Sender must have right to delegate
	 *          Sender han't voted before
	 *          Receiver is not Sender
	 *          Receiver must have right to delegate
	 *
	 *  @param  sessionId     Session ID of a Ballot Session
	 *  @param  to            Person to delegate
	 */
	function delegate(uint256 sessionId, address to) external validSession(sessionId) disallowedContractAddress(to) {
		Session storage session = sessions[sessionId];
		Voter storage delegateFrom = session.voters[msg.sender];

		require(delegateFrom.weight != 0, "No right to vote");
		require(!delegateFrom.isVoted, "Already voted");
		require(to != msg.sender, "Not allowed self-delegation");

		while (session.voters[to].delegated != address(0)) {
			to = session.voters[to].delegated;

			require(to != msg.sender, "Found loop in delegation");
		}

		Voter storage delegateTo = session.voters[to];

		require(delegateTo.weight >= 1, "No right to vote");

		delegateFrom.isVoted = true;
		delegateFrom.delegated = to;

		if (delegateTo.isVoted) {
			uint256 candidateIndex = _findCandidateIndex(sessionId, delegateTo.candidateId);
			session.candidates[candidateIndex].voteCount += delegateFrom.weight;
		}

		delegateTo.weight += delegateFrom.weight;
	}

	/**
	 *  @dev    Vote a candidate.
	 *
	 *  @notice Action must be done when the state of Status is VOTING
	 *          User must have right to vote
	 *          User's not already voted yet
	 *
	 *  @param  sessionId     Session ID of a Ballot Session
	 *  @param  candidateId   ID if candidate to delegate
	 */
	function vote(uint256 sessionId, uint256 candidateId) external validSession(sessionId) {
		Session storage session = sessions[sessionId];
		Voter storage voter = session.voters[msg.sender];

		require(voter.weight != 0, "No right to vote");
		require(!voter.isVoted, "Already voted");

		voter.isVoted = true;
		voter.candidateId = candidateId;

		uint256 candidateIndex = _findCandidateIndex(sessionId, candidateId);
		session.candidates[candidateIndex].voteCount += voter.weight;
	}

	/**
	 *  @dev    Get winning candidate.
	 *
	 *  @notice Action must be done when the state of Status is DONE
	 *
	 *  @param  sessionId     Session ID of a Ballot Session
	 *
	 *  @return Winning Canidate ID
	 */
	function winningCandidate(uint256 sessionId) external view validSession(sessionId) returns (Candidate memory) {
		Session storage session = sessions[sessionId];

		uint256 winningIndex = 0;

		for (uint16 i = 0; i < session.candidates.length; i++) {
			if (session.candidates[i].voteCount > session.candidates[winningIndex].voteCount) {
				winningIndex = i;
			}
		}

		return session.candidates[winningIndex];
	}

	/**
	 *  @dev    Get Ballot Session status.
	 *
	 *  @param  sessionId     Session ID of a Ballot Session
	 *
	 *  @return Status of ballot session
	 */
	function getSessionStatus(uint256 sessionId) public view validSession(sessionId) returns (Status) {
		Session storage session = sessions[sessionId];

		if (block.timestamp < session.startTime) return Status.PENDDING;
		if (block.timestamp > session.endTime) return Status.DONE;
		return Status.VOTING;
	}

	function _findCandidateIndex(uint256 sessionId, uint256 candidateId) private view returns (uint256) {
		Session storage session = sessions[sessionId];
		for (uint i = 0; i < session.candidates.length; i++) {
			Candidate memory candidate = session.candidates[i];
			if (candidate.id == candidateId) return i;
		}
		return session.candidates.length;
	}
}

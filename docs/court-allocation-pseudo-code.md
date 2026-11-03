listOfPlayer
listOfPlayerWithFriendRequests - rank by number of friend requests, higher first
listOfCommitteeWithFriendRequest - rank by number of friend requests, higher first

tempListOfPlayer = copy of listOfPlayer
tempListOfCommitteeWithFriendRequest = copy of listOfCommitteeWithFriendRequest
templistOfPlayerWithFriendRequests = copy of listOfPlayerWithFriendRequests



for n in session.length:
  for n in courts:
    for p in tempListOfPlayer:
      if tempListOfCommitteeWithFriendRequest == empty:
        tempListOfCommitteeWithFriendRequest = copy of listOfCommitteeWithFriendRequest

      if templistOfPlayerWithFriendRequests == empty:
        templistOfPlayerWithFriendRequests = copy of listOfPlayerWithFriendRequests

      if tempListOfCommitteeWithFriendRequest in tempListOfPlayer:
        for c in tempListOfCommitteeWithFriendRequest:
          if c in tempListofPlayer:
            selectedAnchor = c
            rand(selectedAnchor.friend[])
            court[n] = [selectedAnchor, selectedAnchor.friend[0], selectedAnchor.friend[1], selectedAnchor.friend[2]]
            remove selectedAnchor and selectedAnchor.friend[0], selectedAnchor.friend[1], selectedAnchor.friend[2] from tempListOfPlayer
            remove c from tempListOfCommitteeWithFriendRequest

      if // same for normal player

      if tempListOfPlayer is empty:
        tempListOfPlayer = copy of listOfPlayer

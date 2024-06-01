const path = require('path')
const express = require('express')
const app = express()
app.use(express.json())

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')

const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
let db = null
const dbPath = path.join(__dirname, 'twitterClone.db')

const initalizeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}
initalizeDbAndServer()

convertToCamelCase = Tweet => {
  return {
    username: Tweet.username,
    tweet: Tweet.tweet,
    dateTime: Tweet.date_time,
  }
}

convertToArray = dbObj => {
  return {
    likes: dbObj,
  }
}

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  console.log(password)
  const getUsernameQuery = `select * from User where username='${username}';`
  const dbUsername = await db.get(getUsernameQuery)
  if (dbUsername !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const createNewUserQuery = `INSERT INTO User(name,username,password,gender) VALUES
            ('${name}','${username}','${hashedPassword}','${gender}');`
      await db.run(createNewUserQuery)
      response.status(200)
      response.send('User created successfully')
    }
  }
})

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const getUserQuery = `select * from User where username='${username}';`
  const getUser = await db.get(getUserQuery)
  if (getUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, getUser.password)
    if (isPasswordMatched === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        console.log(payload)
        request.username = payload.username
        next()
      }
    })
  }
}

app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUsernameQuery = `select user_id from User where username='${username}';`
  const {user_id} = await db.get(getUsernameQuery)
  const {limit} = request.query
  const getUserTweetsQuery = `select username,tweet,tweet.date_time from User INNER JOIN Tweet 
ON User.user_id=Tweet.user_id INNER JOIN Follower ON Follower.following_user_id=Tweet.user_id
where Follower.follower_user_id=${user_id} ORDER BY tweet.date_time DESC limit ${limit};`
  const getUserTweets = await db.all(getUserTweetsQuery)
  response.send(getUserTweets.map(tweet => convertToCamelCase(tweet)))
})

//API 4
app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUsernameQuery = `select user_id from User where username='${username}';`
  const {user_id} = await db.get(getUsernameQuery)
  const getFollowersQuery = `select DISTINCT name from User INNER JOIN 
  Follower ON User.user_id=Follower.Following_user_id where follower.follower_user_id=${user_id};`
  const getFollowers = await db.all(getFollowersQuery)
  response.send(getFollowers)
})

//API 5
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUsernameQuery = `select user_id from User where username='${username}';`
  const {user_id} = await db.get(getUsernameQuery)

  const getFollowingQuery = `select DISTINCT name from User INNER JOIN 
  Follower ON User.user_id=Follower.follower_user_id where Follower.following_user_id=${user_id};`
  const getFollowing = await db.all(getFollowingQuery)
  response.send(getFollowing)
})

//API 6
app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {tweetId} = request.params
  const {username} = request
  const getUsernameQuery = `select user_id from User where username='${username}';`
  const {user_id} = await db.get(getUsernameQuery)

  const followerTweetsQuery = `select tweet,COUNT(DISTINCT Like.like_id) AS likes, COUNT(DISTINCT reply.reply_id) AS replies,Tweet.date_time AS dateTime
  from Follower INNER JOIN Tweet ON Follower.following_user_id=Tweet.user_id LEFT JOIN Reply ON 
  Tweet.tweet_id=reply.tweet_id LEFT JOIN like ON Tweet.tweet_id=like.tweet_id
  WHERE follower_user_id=${user_id} AND Tweet.tweet_id=${tweetId} GROUP BY Tweet.tweet_id ORDER BY Tweet.tweet_id
  ;`
  const getFollowersTweets = await db.get(followerTweetsQuery)
  if (getFollowersTweets === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    response.send(getFollowersTweets)
  }
})

//API 7
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const getUsernameQuery = `select user_id from User where username='${username}';`
    const {user_id} = await db.get(getUsernameQuery)

    const getUserNamesQuery = `select User.username from User INNER JOIN Like ON
  User.user_id=Like.user_id INNER JOIN Follower ON User.user_id=Follower.following_user_id
  where Follower.follower_user_id=${user_id} AND tweet_id=${tweetId};`
    const getUsers = await db.all(getUserNamesQuery)
    if (getUsers.length === 0) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const arrayOfNames = getUsers.map(obj => obj.username)
      response.send(convertToArray(arrayOfNames))
    }
  },
)

//API 8
app.get(
  '/tweets/:tweetId/replies',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const getUsernameQuery = `select user_id from User where username='${username}';`
    const {user_id} = await db.get(getUsernameQuery)

    const getRepliedUserQuery = `select User.name, reply from user INNER JOIN Reply
    ON User.user_id=Reply.user_id INNER JOIN Follower ON User.user_id=Follower.following_user_id
    where Follower.follower_user_id=${user_id} AND tweet_id=${tweetId};`
    const getRepliedUsers = await db.all(getRepliedUserQuery)
    if (getRepliedUserQuery === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      response.send({
        replies: getRepliedUsers,
      })
    }
  },
)

//API 9
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUsernameQuery = `select user_id from User where username='${username}';`
  const {user_id} = await db.get(getUsernameQuery)

  const getUserTweetsQuery = `select tweet,COUNT(DISTINCT like_id)as likes,
  COUNT(DISTINCT reply_id) as replies, Tweet.date_time as dateTime from User INNER JOIN Tweet ON User.user_id=Tweet.user_id LEFT JOIN Like
  ON Tweet.tweet_id=Like.tweet_id LEFT JOIN Reply ON Tweet.tweet_id=Reply.tweet_id
  where Tweet.user_id=${user_id};`
  const getUserTweets = await db.all(getUserTweetsQuery)
  response.send(getUserTweets)
})

//API 10
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweet} = request.body
  const createTweetQuery = `insert into Tweet(tweet) VALUES('${tweet}');`
  db.run(createTweetQuery)
  response.send('Created a Tweet')
})

//API 11
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const getUsernameQuery = `select user_id from User where username='${username}';`
    const {user_id} = await db.get(getUsernameQuery)
    const getusertweets = `select tweet_id from Tweet where user_id=${user_id} AND tweet_id=${tweetId};`
    const getTweets = await db.get(getusertweets)
    if (getTweets === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const deleteUserTweet = `delete from Tweet where user_id=${user_id} AND tweet_id=${tweetId};`
      await db.run(deleteUserTweet)
      response.send('Tweet Removed')
    }
  },
)

module.exports = app

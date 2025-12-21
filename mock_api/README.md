# Mock API Project

Three separate REST APIs running on different ports with sample endpoints.

## APIs

### 1. Users API (Port 3001)
- `GET /users` - Retrieve all users
- `POST /users` - Create a new user
- `DELETE /users/:id` - Delete a user by ID

### 2. Posts API (Port 3002)
- `GET /posts` - Retrieve all posts
- `POST /posts` - Create a new post
- `DELETE /posts/:id` - Delete a post by ID

### 3. Comments API (Port 3003)
- `GET /comments` - Retrieve all comments
- `POST /comments` - Create a new comment
- `DELETE /comments/:id` - Delete a comment by ID

## Installation

```bash
npm install
```

## Running APIs

Run all three APIs concurrently:
```bash
npm run all
```

Or run individually:
```bash
npm run users    # Port 3001
npm run posts    # Port 3002
npm run comments # Port 3003
```

## Example API Calls

### Users API
```bash
# GET users
curl http://localhost:3001/users

# POST new user
curl -X POST http://localhost:3001/users \
  -H "Content-Type: application/json" \
  -d '{"name":"David","email":"david@example.com"}'

# DELETE user
curl -X DELETE http://localhost:3001/users/1
```

### Posts API
```bash
# GET posts
curl http://localhost:3002/posts

# POST new post
curl -X POST http://localhost:3002/posts \
  -H "Content-Type: application/json" \
  -d '{"title":"New Post","content":"Content here","author":"Alice"}'

# DELETE post
curl -X DELETE http://localhost:3002/posts/1
```

### Comments API
```bash
# GET comments
curl http://localhost:3003/comments

# POST new comment
curl -X POST http://localhost:3003/comments \
  -H "Content-Type: application/json" \
  -d '{"postId":1,"author":"Bob","text":"Nice!"}'

# DELETE comment
curl -X DELETE http://localhost:3003/comments/1
```

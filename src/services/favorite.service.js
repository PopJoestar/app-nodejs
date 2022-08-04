import NotFoundError from "../errors/not-found.error.js";
import { toNativeTypes } from "../utils.js";
import { int } from "neo4j-driver";
export default class FavoriteService {
  driver;

  constructor(driver) {
    this.driver = driver;
  }

  async all(userId, sort = "title", order = "ASC", limit = 6, skip = 0) {
    const session = this.driver.session();
    const res = await session.readTransaction((tx) =>
      tx.run(
        `MATCH (u:User {userId: $userId})-[r:HAS_FAVORITE]->(m:Movie)
          RETURN m {
              .*,
              favorite: true
          } AS movie
          ORDER BY m.\`${sort}\` ${order}
          SKIP $skip
          LIMIT $limit
    `,
        { userId, skip: int(skip), limit: int(limit) }
      )
    );
    const movies = res.records.map((row) => toNativeTypes(row.get("movie")));

    await session.close();

    return movies;
  }

  async add(userId, movieId) {
    const session = this.driver.session();

    const res = await session.writeTransaction((tx) =>
      tx.run(
        `
MATCH (u:User {userId: $userId})
MATCH (m:Movie {tmdbId: $movieId})

MERGE (u)-[r:HAS_FAVORITE]->(m)
ON CREATE SET u.createdAt = datetime()

RETURN m {
  .*,
  favorite: true
} AS movie
`,
        { userId, movieId }
      )
    );

    await session.close();

    if (res.records.length === 0) {
      throw new NotFoundError(
        `Couldn't create a favorite relationship for User ${userId} and Movie ${movieId}`
      );
    }

    return toNativeTypes(res.records[0].get("movie"));
  }

  async remove(userId, movieId) {
    const session = this.driver.session();

    const res = await session.writeTransaction((tx) =>
      tx.run(
        `MATCH (u:User {userId: $userId})-[r:HAS_FAVORITE]->(m:Movie {tmdbId: $movieId})
    DELETE r
    
    RETURN m {
        .*,
        favorite: false
    } AS movie`,
        { userId, movieId }
      )
    );

    await session.close();

    if (res.records.length === 0) {
      throw new NotFoundError(
        `Couldn't create a favorite relationship for User ${userId} and Movie ${movieId}`
      );
    }

    return toNativeTypes(res.records[0].get("movie"));
  }
}

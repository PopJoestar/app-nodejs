import jwt from "jsonwebtoken";
import { hash, compare } from "bcrypt";
import { user } from "../../test/fixtures/users.js";
import ValidationError from "../errors/validation.error.js";
import { JWT_SECRET, SALT_ROUNDS } from "../constants.js";

export default class AuthService {
  driver;

  constructor(driver) {
    this.driver = driver;
  }

  async register(email, plainPassword, name) {
    const session = this.driver.session();
    try {
      const encrypted = await hash(plainPassword, parseInt(SALT_ROUNDS));

      const res = await session.writeTransaction((tx) =>
        tx.run(
          `CREATE (u:User {
            userId: randomUuid(),
            email: $email,
            password: $encrypted,
            name: $name
          })
          RETURN u`,
          { email, encrypted, name }
        )
      );
      const user = res.records[0].get("u").properties;
      const { password, ...safeProperties } = user;

      return {
        ...safeProperties,
        token: jwt.sign(this.userToClaims(safeProperties), JWT_SECRET),
      };
    } catch (e) {
      if (e.code === "Neo.ClientError.Schema.ConstraintValidationFailed") {
        throw new ValidationError(
          `An account already exists with the email address ${email}`,
          {
            email: "Email address taken",
          }
        );
      }

      throw e;
    } finally {
      await session.close();
    }
  }

  async authenticate(email, unencryptedPassword) {
    const session = this.driver.session();

    const res = await session.readTransaction((tx) =>
      tx.run("MATCH (u:User {email: $email}) RETURN u", { email })
    );

    await session.close();

    if (res.records.length == 0) return false;

    const user = res.records[0].get("u").properties;

    const encryptedPassword = user.password;

    const isPasswordCorrect = await compare(
      unencryptedPassword,
      encryptedPassword
    );

    if (isPasswordCorrect == false) return false;

    const { password, ...safeProperties } = user;

    return {
      ...safeProperties,
      token: jwt.sign(this.userToClaims(safeProperties), JWT_SECRET),
    };
  }

  // end::authenticate[]

  /**
   * @private
   * This method should take a user's properties and convert the "safe" properties into
   * a set of claims that can be encoded into a JWT
   *
   * @param {Record<string, any>} user The User's properties from the database
   * @returns {Record<string, any>} Claims for the token
   */
  userToClaims(user) {
    const { name, userId } = user;

    return { sub: userId, userId, name };
  }

  /**
   * @public
   * This method should take the claims encoded into a JWT token and returm
   * the information needed to authenticate this user against the database.
   *
   * @param {Record<string, any>} claims
   * @returns {Promise<Record<string, any>>}  The "safe" properties encoded above
   */
  async claimsToUser(claims) {
    return {
      ...claims,
      userId: claims.sub,
    };
  }
}

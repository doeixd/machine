
import { createMachine, TypeState } from '../src/index';

// Previous way (using intersection)
// type LoggedOutOld = Machine<{ status: "loggedOut" }> & {
//   login: (username: string) => LoggedInOld;
// };

// New way (using TypeState)
type LoggedOut = TypeState<{ status: "loggedOut" }, {
  login: (username: string) => LoggedIn;
}>;

type LoggedIn = TypeState<{ status: "loggedIn"; username: string }, {
  logout: () => LoggedOut;
  viewProfile: () => LoggedIn;
}>;


// Forward declare to handle circular dependency in transitions
let loggedInTransitions: any;

const loggedOut: LoggedOut = createMachine({ status: "loggedOut" }, {
  login(username: string) {
    return createMachine({ status: "loggedIn", username }, loggedInTransitions);
  }
});

loggedInTransitions = {
  logout() {
    return createMachine({ status: "loggedOut" }, (loggedOut as any)); // reusing the machine as transitions
  },
  viewProfile(this: { username: string }) {
    return createMachine({ status: "loggedIn", username: this.context.username }, loggedInTransitions);
  }
};

// Verify types work as expected
const sub: LoggedIn = loggedOut.login("alice");
const back: LoggedOut = sub.logout();

console.log("TypeState verification successful");

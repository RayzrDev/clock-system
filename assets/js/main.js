Vue.use(Vuetify);

Vue.component('user', {
    props: ['state', 'index'],
    methods: {
        remove() {
            this.$emit('remove', this.index);
        },
        clockOut() {
            this.$emit('clock-out', this.index);
        }
    },
    computed: {
        localeTime() {
            return new Date(this.state.clockIn).toLocaleTimeString();
        }
    },
    template: `
        <v-card>
            <v-card-title primary-title>
                <h3 class="headline">{{state.name}}</h3>
            </v-card-title>
            <v-card-text>Clocked in since {{localeTime}}</v-card-text>
            <v-divider></v-divider>
            <v-card-actions>
                <v-btn @click="remove">Cancel</v-btn>
                <v-btn color="primary" @click="clockOut">Clock Out</v-btn>
            </v-card-actions>
        </v-card>
    `
});

Vue.component('user-picker', {
    props: ['users'],
    methods: {
        select(index) {
            this.$emit('select', index);
        }
    },
    template: `
        <v-card v-if="users.length">
            <v-card-title class="headline">Already clocked in?</v-card-title>
            <v-card-text>
                <v-layout flex>
                    <v-btn outline xs6 sm3 md2 v-for="(user, index) in users" @click="select(index)">{{user.name}}</v-btn>
                </v-layout>
            </v-card-text>
        </v-card>
    `
})

Vue.component('settings', {
    props: ['authorized', 'spreadsheet'],
    data() {
        return {
            dialog: false,
            spreadsheetName: ''
        }
    },
    methods: {
        signIn() {
            window.GoogleAuth.signIn();
        },
        signOut() {
            window.GoogleAuth.signOut();
        },
        selectSheet() {
            pickFile().then(res => {
                if (res && res.docs && res.docs.length) {
                    const doc = res.docs[0];
                    this.spreadsheet.id = doc.id;
                    this.spreadsheet.name = doc.name;

                    console.log('Saving...');
                    this.$emit('save');
                }
            });
        }
    },
    template: `
        <v-dialog v-model="dialog" width="600">
            <template v-slot:activator = "{ on }">
                <v-list-tile color="red lighten-2" v-on="on">
                    <v-list-tile-title>Settings</v-list-tile-title>
                </v-list-tile>
            </template>

            <v-card>
                <v-card-title class="headline">
                    Settings
                </v-card-title>

                <v-divider></v-divider>

                <v-card-text>
                    Selected spreadsheet: <b>{{ spreadsheet.name || 'None' }}</b>
                </v-card-text>

                <v-card-actions>
                    <v-btn v-if="authorized" color="primary" outline @click="selectSheet">Select...</v-btn>
                    <v-spacer></v-spacer>
                    <v-btn v-if="!authorized" color="primary" flat @click="signIn">
                        Sign In
                    </v-btn>
                    <v-btn v-if="authorized" color="primary" flat @click="signOut">
                        Sign Out
                    </v-btn>
                    <v-btn flat @click="dialog = false">Close</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    `
});

const app = new Vue({
    el: '#app',
    data: {
        users: [],
        newUser: { name: '', clockIn: null },
        dark: false,
        authorized: false,
        currentUser: -1,
        spreadsheet: {
            id: null,
            name: ''
        },
        notification: {
            clockOutSuccess: false,
            clockOutError: false
        }
    },
    mounted() {
        let settings;
        try {
            settings = JSON.parse(localStorage.getItem('clock-state'))
        } catch (ignore) { console.log('Failed to parse!') }

        if (settings && settings.users) {
            // Manually handle
            this.users = settings.users;
            this.dark = settings.dark;
            this.spreadsheet = settings.spreadsheet || { id: null, name: '' };
        }
    },
    watch: {
        users(_, state) {
            this.saveData();
        }
    },
    methods: {
        saveData() {
            console.log('Saving data!');
            console.log(this.spreadsheet);
            localStorage.setItem('clock-state', JSON.stringify({
                users: this.users,
                dark: this.dark,
                spreadsheet: this.spreadsheet
            }));
        },
        toggleDark() {
            this.dark = !this.dark;
            this.saveData();
        },
        updateSpreadsheet(spreadsheet) {
            this.spreadsheet = spreadsheet;
            this.saveData();
        },
        verifySpreadsheet() {
            if (this.spreadsheet.id) {
                gapi.client.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheet.id }).then(res => {
                    if (res.status !== 200) {
                        this.spreadsheet = { id: null, name: '' };
                    }
                }).catch(error => {
                    this.spreadsheet = { id: null, name: '' };
                });
            }
        },
        clockIn() {
            if (!this.newUser.name) {
                return;
            }

            this.newUser.clockIn = Date.now();
            this.users.push(this.newUser);
            this.currentUser = this.users.length - 1;

            // reset
            this.newUser = { name: '', clockIn: null };
        },
        clockOut(index) {
            let user = this.users[index];

            user.clockOut = Date.now();

            const diff = user.clockOut - user.clockIn;

            let seconds = Math.floor(diff / 1000);
            let minutes = Math.floor(seconds / 60);
            seconds %= 60;
            let hours = Math.floor(minutes / 60);
            minutes %= 60;

            let formattedDuration = `${hours < 10 ? '0' : ''}${hours.toFixed(0)}:${minutes < 10 ? '0' : ''}${minutes.toFixed(0)}:${seconds < 10 ? '0' : ''}${seconds.toFixed(0)}`;

            let name = user.name;

            gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheet.id,
                valueInputOption: 'RAW',
                majorDimension: 'ROWS',
                range: 'Sheet1!A1',
                values: [[
                    // Name
                    name,
                    // Clock in time
                    new Date(user.clockIn).toLocaleString(),
                    // Clock out time
                    new Date(user.clockOut).toLocaleString(),
                    // Time clocked in
                    formattedDuration
                ]]
            }).then(res => {
                this.remove(index);
                this.notification.clockOutSuccess = true;
            }).catch(error => {
                console.error(error);
                this.notification.clockOutError = true;
            });
        },
        setCurrentUser(index) {
            this.currentUser = index;
        },
        remove(index) {
            this.users.splice(index, 1);
            this.currentUser = -1;
        }
    }
});
// ======================================================
// SUPABASE CONFIG
// ======================================================

const SUPABASE_URL =
    "https://jvxnoegbzyfovwajgclr.supabase.co/rest/v1/";

const SUPABASE_KEY =
    "sb_publishable_fWf3r8eLAPq0W3bFKNu-bw_vlhtDYIB";


const supabaseClient =
    supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );


// ======================================================
// USER DATA
// ======================================================

const myId =
    crypto.randomUUID();

let myUsername = "";

let currentChannelName = "";

let localStream = null;

let isTalking = false;


// ======================================================
// HTML
// ======================================================

const loginScreen =
    document.getElementById(
        "loginScreen"
    );

const radioScreen =
    document.getElementById(
        "radioScreen"
    );

const usernameInput =
    document.getElementById(
        "username"
    );

const channelInput =
    document.getElementById(
        "channel"
    );

const connectButton =
    document.getElementById(
        "connect"
    );

const disconnectButton =
    document.getElementById(
        "disconnect"
    );

const currentChannel =
    document.getElementById(
        "currentChannel"
    );

const userList =
    document.getElementById(
        "userList"
    );

const status =
    document.getElementById(
        "status"
    );

const ptt =
    document.getElementById(
        "ptt"
    );

const pttText =
    document.getElementById(
        "pttText"
    );

const talking =
    document.getElementById(
        "talking"
    );


// ======================================================
// LOAD USERS
// ======================================================

async function loadUsers() {

    console.log(
        "Зареждам канал:",
        currentChannelName
    );


    const {
        data,
        error
    } =
        await supabaseClient

            .from(
                "radio_users"
            )

            .select(
                "id, username, channel"
            )

            .eq(
                "channel",
                currentChannelName
            )

            .order(
                "created_at",
                {
                    ascending: true
                }
            );


    if (error) {

        console.error(
            "Грешка radio_users:",
            error
        );

        userList.innerHTML =
            "❌ Грешка при зареждането.";

        return;

    }


    console.log(
        "Намерени потребители:",
        data
    );


    renderUsers(
        data || []
    );

}


// ======================================================
// DISPLAY USERS
// ======================================================

function renderUsers(users) {

    userList.innerHTML = "";


    if (
        users.length === 0
    ) {

        userList.innerHTML =
            "Няма потребители.";

        return;

    }


    users.forEach(
        user => {

            const div =
                document.createElement(
                    "div"
                );


            div.className =
                "user";


            const isMe =
                user.id === myId;


            div.innerHTML =
                `
                <span class="online">
                    🟢
                </span>

                <span>
                    ${escapeHtml(
                        user.username
                    )}

                    ${
                        isMe
                            ? " (ти)"
                            : ""
                    }
                </span>
                `;


            userList.appendChild(
                div
            );

        }
    );

}


// ======================================================
// REALTIME USERS
// ======================================================

let usersRealtime = null;


function startUsersRealtime() {

    usersRealtime =
        supabaseClient

            .channel(
                "users-" +
                myId
            )

            .on(

                "postgres_changes",

                {
                    event: "*",

                    schema: "public",

                    table:
                        "radio_users"

                },

                payload => {

                    console.log(
                        "Realtime:",
                        payload
                    );


                    // Проверяваме
                    // отново нашия канал

                    loadUsers();

                }

            )

            .subscribe(
                state => {

                    console.log(
                        "Realtime state:",
                        state
                    );

                }
            );

}


// ======================================================
// MICROPHONE
// ======================================================

async function enableMicrophone() {

    try {

        localStream =
            await navigator.mediaDevices
                .getUserMedia({

                    audio: {

                        echoCancellation:
                            true,

                        noiseSuppression:
                            true,

                        autoGainControl:
                            true

                    },

                    video: false

                });


        // В началото е mute

        localStream
            .getAudioTracks()
            .forEach(
                track => {

                    track.enabled =
                        false;

                }
            );


        console.log(
            "🎙️ Микрофонът е готов"
        );


    } catch (error) {

        console.error(
            "Microphone error:",
            error
        );


        throw new Error(
            "Няма достъп до микрофона."
        );

    }

}


// ======================================================
// JOIN CHANNEL
// ======================================================

connectButton.addEventListener(
    "click",
    async () => {

        const username =
            usernameInput.value
                .trim();

        const channel =
            channelInput.value
                .trim();


        if (!username) {

            alert(
                "Въведи име."
            );

            return;

        }


        if (!channel) {

            alert(
                "Въведи канал."
            );

            return;

        }


        connectButton.disabled =
            true;


        try {

            // Микрофон

            await enableMicrophone();


            myUsername =
                username;

            currentChannelName =
                channel;


            console.log(
                "Влизам в:",
                currentChannelName
            );


            // Ако старият user
            // съществува

            await supabaseClient

                .from(
                    "radio_users"
                )

                .delete()

                .eq(
                    "id",
                    myId
                );


            // Записваме потребителя

            const {
                error
            } =
                await supabaseClient

                    .from(
                        "radio_users"
                    )

                    .insert({

                        id:
                            myId,

                        username:
                            myUsername,

                        channel:
                            currentChannelName

                    });


            if (error) {

                throw error;

            }


            // UI

            currentChannel.textContent =
                currentChannelName;


            loginScreen.classList.add(
                "hidden"
            );


            radioScreen.classList.remove(
                "hidden"
            );


            status.textContent =
                "🟢 В канал " +
                currentChannelName;


            // Зареждаме хората

            await loadUsers();


            // Realtime

            startUsersRealtime();


        } catch (error) {

            console.error(
                error
            );


            alert(
                error.message ||
                "Възникна грешка."
            );


            if (localStream) {

                localStream
                    .getTracks()
                    .forEach(
                        track =>
                            track.stop()
                    );

                localStream =
                    null;

            }

        }


        connectButton.disabled =
            false;

    }
);


// ======================================================
// PTT START
// ======================================================

function startTalking() {

    if (
        !localStream ||
        isTalking
    ) {

        return;

    }


    isTalking = true;


    localStream
        .getAudioTracks()
        .forEach(
            track => {

                track.enabled =
                    true;

            }
        );


    ptt.classList.add(
        "talking"
    );


    pttText.textContent =
        "ГОВОРИШ...";


    talking.textContent =
        "🔴 Говориш";


    talking.classList.add(
        "active"
    );

}


// ======================================================
// PTT STOP
// ======================================================

function stopTalking() {

    if (!localStream) {

        return;

    }


    isTalking = false;


    localStream
        .getAudioTracks()
        .forEach(
            track => {

                track.enabled =
                    false;

            }
        );


    ptt.classList.remove(
        "talking"
    );


    pttText.textContent =
        "ЗАДРЪЖ И ГОВОРИ";


    talking.textContent =
        "Готов за разговор";


    talking.classList.remove(
        "active"
    );

}


// ======================================================
// PTT MOUSE
// ======================================================

ptt.addEventListener(
    "mousedown",
    event => {

        event.preventDefault();

        startTalking();

    }
);


ptt.addEventListener(
    "mouseup",
    event => {

        event.preventDefault();

        stopTalking();

    }
);


ptt.addEventListener(
    "mouseleave",
    () => {

        stopTalking();

    }
);


// ======================================================
// PTT TOUCH
// ======================================================

ptt.addEventListener(
    "touchstart",
    event => {

        event.preventDefault();

        startTalking();

    },
    {
        passive: false
    }
);


ptt.addEventListener(
    "touchend",
    event => {

        event.preventDefault();

        stopTalking();

    },
    {
        passive: false
    }
);


ptt.addEventListener(
    "touchcancel",
    event => {

        event.preventDefault();

        stopTalking();

    },
    {
        passive: false
    }
);


// ======================================================
// DISCONNECT
// ======================================================

disconnectButton.addEventListener(
    "click",
    async () => {

        stopTalking();


        // Изтриваме потребителя

        await supabaseClient

            .from(
                "radio_users"
            )

            .delete()

            .eq(
                "id",
                myId
            );


        // Спираме realtime

        if (
            usersRealtime
        ) {

            await supabaseClient
                .removeChannel(
                    usersRealtime
                );

            usersRealtime =
                null;

        }


        // Спираме микрофона

        if (localStream) {

            localStream
                .getTracks()
                .forEach(
                    track =>
                        track.stop()
                );

            localStream =
                null;

        }


        currentChannelName =
            "";


        radioScreen.classList.add(
            "hidden"
        );


        loginScreen.classList.remove(
            "hidden"
        );


        status.textContent =
            "⚫ Няма връзка";


        userList.innerHTML =
            "";


        channelInput.value =
            "";

    }
);


// ======================================================
// ESCAPE HTML
// ======================================================

function escapeHtml(text) {

    const element =
        document.createElement(
            "div"
        );

    element.textContent =
        text;

    return element.innerHTML;

}

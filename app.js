const SUPABASE_URL = "https://jvxnoegbzyfovwajgclr.supabase.co/rest/v1/";
const SUPABASE_KEY = "sb_publishable_fWf3r8eLAPq0W3bFKNu-bw_vlhtDYIB";

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

let localStream = null;
let peerConnections = {};
let myId = crypto.randomUUID();

let currentChannelName = "";
let myUsername = "";

const connectButton = document.getElementById("connect");
const disconnectButton = document.getElementById("disconnect");
const pttButton = document.getElementById("pushToTalk");

const channelInput = document.getElementById("channel");
const usernameInput = document.getElementById("username");

const radio = document.getElementById("radio");
const currentChannel = document.getElementById("currentChannel");
const userList = document.getElementById("userList");
const status = document.getElementById("status");


// 🎙️ МИКРОФОН
async function getMicrophone() {

    try {

        localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        });

        // Започваме със заглушен микрофон
        localStream.getAudioTracks().forEach(track => {
            track.enabled = false;
        });

        console.log("🎙️ Микрофонът е готов");

    } catch (error) {

        console.error(error);

        alert(
            "Не може да се използва микрофонът. Разреши достъп до микрофона."
        );

        throw error;
    }
}


// 🔊 НОВ WEBRTC CONNECTION
function createPeerConnection(userId) {

    const pc = new RTCPeerConnection({
        iceServers: [
            {
                urls: "stun:stun.l.google.com:19302"
            }
        ]
    });

    peerConnections[userId] = pc;


    // Добавяме микрофона
    if (localStream) {

        localStream.getTracks().forEach(track => {

            pc.addTrack(
                track,
                localStream
            );

        });

    }


    // Получаваме аудио
    pc.ontrack = event => {

        let audio = document.getElementById(
            "audio-" + userId
        );

        if (!audio) {

            audio = document.createElement("audio");

            audio.id = "audio-" + userId;

            audio.autoplay = true;

            audio.playsInline = true;

            document.body.appendChild(audio);

        }

        audio.srcObject = event.streams[0];

    };


    // ICE candidates
    pc.onicecandidate = async event => {

        if (!event.candidate) return;

        await sendSignal(
            userId,
            "candidate",
            event.candidate
        );

    };


    return pc;
}


// 📡 ИЗПРАЩАНЕ НА SIGNAL
async function sendSignal(
    receiverId,
    type,
    message
) {

    await supabaseClient
        .from("radio_signaling")
        .insert({

            channel: currentChannelName,

            sender_id: myId,

            receiver_id: receiverId,

            message_type: type,

            message: message

        });

}


// 📡 ПОЛУЧАВАНЕ НА SIGNAL
function listenForSignals() {

    supabaseClient
        .channel("radio-" + currentChannelName)
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "radio_signaling",
                filter:
                    `channel=eq.${currentChannelName}`
            },
            async payload => {

                const data = payload.new;


                // Не обработваме собствените си съобщения
                if (data.sender_id === myId) {
                    return;
                }


                // Ако е предназначено за друг
                if (
                    data.receiver_id &&
                    data.receiver_id !== myId
                ) {
                    return;
                }


                await handleSignal(data);

            }
        )
        .subscribe();

}


// 🔄 ОБРАБОТКА НА SIGNAL
async function handleSignal(data) {

    const senderId = data.sender_id;

    let pc = peerConnections[senderId];

    if (!pc) {

        pc = createPeerConnection(senderId);

    }


    if (data.message_type === "offer") {

        await pc.setRemoteDescription(
            new RTCSessionDescription(
                data.message
            )
        );


        const answer =
            await pc.createAnswer();


        await pc.setLocalDescription(
            answer
        );


        await sendSignal(
            senderId,
            "answer",
            answer
        );

    }


    else if (data.message_type === "answer") {

        await pc.setRemoteDescription(
            new RTCSessionDescription(
                data.message
            )
        );

    }


    else if (data.message_type === "candidate") {

        try {

            await pc.addIceCandidate(
                new RTCIceCandidate(
                    data.message
                )
            );

        } catch (error) {

            console.error(
                "ICE error:",
                error
            );

        }

    }

}


// 📞 СВЪРЗВАНЕ С ДРУГИТЕ
async function connectToUsers() {

    const { data, error } =
        await supabaseClient
            .from("radio_signaling")
            .select("sender_id")
            .eq(
                "channel",
                currentChannelName
            )
            .neq(
                "sender_id",
                myId
            );


    if (error) {

        console.error(error);

        return;

    }


    const users = [
        ...new Set(
            data.map(
                user => user.sender_id
            )
        )
    ];


    for (const userId of users) {

        if (peerConnections[userId]) {
            continue;
        }


        const pc =
            createPeerConnection(
                userId
            );


        const offer =
            await pc.createOffer();


        await pc.setLocalDescription(
            offer
        );


        await sendSignal(
            userId,
            "offer",
            offer
        );

    }

}


// 🔗 CONNECT
connectButton.addEventListener(
    "click",
    async () => {

        const channel =
            channelInput.value.trim();

        const username =
            usernameInput.value.trim();


        if (!channel || !username) {

            alert(
                "Въведи име и канал!"
            );

            return;

        }


        currentChannelName =
            channel;

        myUsername =
            username;


        try {

            await getMicrophone();

        } catch {

            return;

        }


        currentChannel.textContent =
            currentChannelName;


        userList.innerHTML =
            "👤 " + myUsername;


        radio.classList.remove(
            "hidden"
        );


        status.textContent =
            "🟢 Свързан";


        listenForSignals();


        // Записваме се в канала
        await supabaseClient
            .from("radio_signaling")
            .insert({

                channel:
                    currentChannelName,

                sender_id:
                    myId,

                receiver_id:
                    null,

                message_type:
                    "join",

                message: {

                    username:
                        myUsername

                }

            });


        // Даваме малко време
        // за откриване на другите
        setTimeout(
            connectToUsers,
            1000
        );

    }
);


// 🎙️ PTT - НАТИСНИ
function startTalking() {

    if (!localStream) return;


    localStream
        .getAudioTracks()
        .forEach(track => {

            track.enabled = true;

        });


    pttButton.innerHTML =
        "🔴<span>ГОВОРИШ...</span>";

}


// 🎙️ PTT - ПУСНИ
function stopTalking() {

    if (!localStream) return;


    localStream
        .getAudioTracks()
        .forEach(track => {

            track.enabled = false;

        });


    pttButton.innerHTML =
        "🎙️<span>ЗАДРЪЖ И ГОВОРИ</span>";

}


// 📱 TOUCH
pttButton.addEventListener(
    "touchstart",
    event => {

        event.preventDefault();

        startTalking();

    }
);


pttButton.addEventListener(
    "touchend",
    event => {

        event.preventDefault();

        stopTalking();

    }
);


// 🖱️ COMPUTER
pttButton.addEventListener(
    "mousedown",
    startTalking
);


pttButton.addEventListener(
    "mouseup",
    stopTalking
);


// 🚪 DISCONNECT
disconnectButton.addEventListener(
    "click",
    () => {

        if (localStream) {

            localStream
                .getTracks()
                .forEach(track =>
                    track.stop()
                );

        }


        Object.values(
            peerConnections
        ).forEach(pc =>
            pc.close()
        );


        peerConnections = {};


        radio.classList.add(
            "hidden"
        );


        status.textContent =
            "⚫ Няма връзка";

    }
);
// lib/firebase-admin.ts
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app =
  getApps().length === 0
    ? initializeApp({
        credential: cert({
          projectId: "rise-dde1d",
          clientEmail: "firebase-adminsdk-fbsvc@rise-dde1d.iam.gserviceaccount.com",
          privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCy13v3JOTsQbUt\n12dWN7kI+H4v7zsbvt8kjeTEGxMSGFmz7TCMUn8I2Z9az4i1CMZrm43i2QL+zZvH\nC2MO7Ywyf5i50ZqvRmfRSkvPRfCxpLNSkPb6TlbO3/VyrFjduz4VH330qvP5Fm7B\nGPZ1DT7PB4rujwe49icxmHoEB1OJgvKdIvCef/U73foxROly/NVlYNkrgpAoCP8E\n+w1XzNqbVEl1DHpC3oYkKVGel/EQZcBxJa8QCa/U639ISzw4i/iOTJoHJuWEjsGO\nwnvdFl/fAGnrXHLhSJfkyslCDdTabkAeVmy9Q6cONnnN0aahZXvVUZmXUC026bbX\n+fnoM1k5AgMBAAECggEAETyOOrXEOAaFtCU7dQ5yD5ymic9qcJxC9KqV0rZCzmbJ\nJ3ub5xxQ2M0jrAyOQhd2Szr+7+8HOEBgDA0rhw3rShcs5LTgThYQrbXVzGRy5CYp\n79JfsWRxPqdMaFjWyEkSfNXwDW+YC8jnFAaIQ2QLSogRMniXz5Ju2Nt3oBGGMj2i\nq0BleJugXN0FoUe+VYxNb/pls5XXFDHeWEtJcSBhLI/9etK18mFF34NV6CFaz6zX\nigD3ehbRJErBO9tQnuVAuu2bI8jhsFP+vNP9nkRqOvtgx+aMpX5ZSIJcp74CdWCw\nW+ZZRV2GHyrOiz6aViSEFf7jALnE0xDcRcuhKOi6kQKBgQDoLEXBOoMq6f/36Ziu\n0Z37vWQMaHlyTETZJWMYjL6p1vy9GKRvBbwEXnOCMxQX/ZMe5Frwc+/koHn2l9Qt\nFDd6GxL0LpzbXQlIxpGvErykBwxup75Y5rh34xbe0sdNjDCktCnJnuiYyfQKupox\nLayZB4DXzJ3H4sXgoC2T7+OxMQKBgQDFMhNzRG5lWdS1J7cbSLtawHV4KYIFFAng\nodYb4JlcqGPjSMHOVE3BxalFA0ryYMKQAcUtd02d3jx4NFddrgEHQBasUd+vTxib\nULcjLcxyoEGGMXt/WLfsijNVhlhovaKh9jSs5dXbFdIRNNxA+0toA5q4k66hLWLf\nNELZCsBmiQKBgQCEMzlg5nVrySREQNH8sUUY4+WFHzQP/hex4ZUElJe4U79D2TVA\nNm6xuiphd744Tt4n1/VkN0/gyfPIkvlw1bMlJydqvOP6EIbJ1q97ldquN4k/tOow\n6ucc9MTAChsMMAg+sIuez4o3/b6lIU3NNOmzlU8rEcrB14G+/tYVB6KJ8QKBgQCi\nZPnVnE5Z0t+0DC/kHUKFmydiPLShn/3+auibbpx9zQLtwxYv6AddA33BotOOxZaU\n55BNQAnAb6tWxqwILusT4HiLkqVmhvnZtmALbYUIBOfRLmDo39QfzTQ3Q3r9TuZn\nAQ4iMOisEs07dE/Kh+hykT1SsfRHMcxRyoUenpcSGQKBgBAwOI09KX1qxgSOWC4y\nNav/0XF7ftSlwvBdyEAeJnNYo5md59v4EuXzu4birEwbelnGd+8TcPHFUEJ5W0zg\n0RfIdR10MjT6uxMQxhMHdhZ8x31IBmAEF5flMRJzTv12alkW8xxmYCdSwbRBv2qO\nHal8BdPH1gM4cNSrq0ILyHSG\n-----END PRIVATE KEY-----\n",
        }),
      })
    : getApps()[0];

export const db = getFirestore(app);

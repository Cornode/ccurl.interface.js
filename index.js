var cornode = require('cornode.lib.js');
var ffi = require('ffi');
var fs = require('fs');

module.exports = function(trunkTransaction, branchTransaction, minWeightMagnitude, trytes, ccurlPath, callback) {

    // If no file path provided, switch arguments
    if (arguments.length === 5 && Object.prototype.toString.call(ccurlPath) === "[object Function]") {
        callback = ccurlPath;
        ccurlPath = __dirname;
    }

    // Declare cornode library
    var cornode = new cornode();

    // inputValidator: Check if correct hash
    if (!cornode.validate.isHash(trunkTransaction)) {

        return callback(new Error("Invalid trunkTransaction"));
    }

    // inputValidator: Check if correct hash
    if (!cornode.validate.isHash(branchTransaction)) {

        return callback(new Error("Invalid branchTransaction"));
    }

    // inputValidator: Check if int
    if (!cornode.validate.isInt(minWeightMagnitude)) {

        return callback(new Error("Invalid minWeightMagnitude"));
    }

    // inputValidator: Check if array of trytes
    if (!cornode.validate.isArrayOfTrytes(trytes)) {

        return callback(new Error("Invalid trytes supplied"));
    }

    // Check if file path exists
    if (!fs.existsSync(ccurlPath)) {
        throw new Error("Incorrect file path!");
    }

    var fullPath = ccurlPath + '/libccurl';

    // Define libccurl to be used for finding the nonce
    var libccurl = ffi.Library(fullPath, {
        ccurl_pow : [ 'string', [ 'string', 'int'] ]
    });

    var finalBundleTrytes = [];
    var previousTxHash;
    var i = 0;

    function loopTrytes() {

        getBundleTrytes(trytes[i], function(error) {

            if (error) {

                return callback(error);

            } else {

                i++;

                if (i < trytes.length) {

                    loopTrytes();

                } else {

                    // reverse the order so that it's ascending from currentIndex
                    return callback(null, finalBundleTrytes.reverse());

                }
            }
        });
    }

    function getBundleTrytes(thisTrytes, callback) {
        // PROCESS LOGIC:
        // Start with last index transaction
        // Assign it the trunk / branch which the user has supplied
        // IF there is a bundle, chain  the bundle transactions via
        // trunkTransaction together

        // If this is the first transaction, to be processed
        // Make sure that it's the last in the bundle and then
        // assign it the supplied trunk and branch transactions
        if (!previousTxHash) {

            var txObject = cornode.utils.transactionObject(thisTrytes);

            // Check if last transaction in the bundle
            if (txObject.lastIndex !== txObject.currentIndex) {
                return callback(new Error("Wrong bundle order. The bundle should be ordered in descending order from currentIndex"));
            }

            txObject.trunkTransaction = trunkTransaction;
            txObject.branchTransaction = branchTransaction;

            var newTrytes = cornode.utils.transactionTrytes(txObject);

            // cCurl updates the nonce as well as the transaction hash
            libccurl.ccurl_pow.async(newTrytes, minWeightMagnitude, function(error, returnedTrytes) {

                if (error) {
                    return callback(error);
                }

                var newTxObject= cornode.utils.transactionObject(returnedTrytes);

                // Assign the previousTxHash to this tx
                var txHash = newTxObject.hash;
                previousTxHash = txHash;

                finalBundleTrytes.push(returnedTrytes);

                return callback(null);
            });

        } else {

            var txObject = cornode.utils.transactionObject(thisTrytes);

            // Chain the bundle together via the trunkTransaction (previous tx in the bundle)
            // Assign the supplied trunkTransaciton as branchTransaction
            txObject.trunkTransaction = previousTxHash;
            txObject.branchTransaction = trunkTransaction;

            var newTrytes = cornode.utils.transactionTrytes(txObject);

            // cCurl updates the nonce as well as the transaction hash
            libccurl.ccurl_pow.async(newTrytes, minWeightMagnitude, function(error, returnedTrytes) {

                if (error) {

                    return callback(error);
                }

                var newTxObject= cornode.utils.transactionObject(returnedTrytes);

                // Assign the previousTxHash to this tx
                var txHash = newTxObject.hash;
                previousTxHash = txHash;

                finalBundleTrytes.push(returnedTrytes);

                return callback(null);
            });
        }
    }

    loopTrytes();
}

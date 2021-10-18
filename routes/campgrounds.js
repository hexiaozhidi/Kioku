var express = require("express");
var router = express.Router();
var Campground = require("../models/campground");
var Comment = require("../models/comment");
var Review = require("../models/review");
var middleware = require("../middleware/index.js");

var multer = require('multer');
var storage = multer.diskStorage({
  filename: function(req, file, callback) {
    callback(null, Date.now() + file.originalname);
  }
});
var imageFilter = function (req, file, cb) {
    // accept image files only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};
var upload = multer({ storage: storage, fileFilter: imageFilter})

var cloudinary = require('cloudinary');
cloudinary.config({ 
  cloud_name: 'dcdox9x32', 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

var NodeGeocoder = require('node-geocoder');
 
var options = {
  provider: 'google',
  httpAdapter: 'https',
  apiKey: process.env.GEOCODER_API_KEY,
  formatter: null
};
 
var geocoder = NodeGeocoder(options);

function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

// INDEX - show all campgrounds
router.get("/", function(req, res) {
	let noMatch = null;
	if (req.query.search) {
		const regex = new RegExp(escapeRegex(req.query.search), 'gi');
		Campground.find({name: regex}, function(err, allCampgrounds) {
			if (err) {
				console.log(err);
			} else {
				if (allCampgrounds.length < 1) {
            		noMatch = "No memories match that query, please try again.";
        		}
				res.render("campgrounds/index",{campgrounds: allCampgrounds, currentUser: req.user, page: 'campgrounds', noMatch: noMatch});
			}
		});
	} else {
		// Get all campgrounds from DB
		Campground.find({}, function(err, allCampgrounds) {
			if (err) {
				console.log(err);
			} else {
				res.render("campgrounds/index", {campgrounds: allCampgrounds, currentUser: req.user, page: 'campgrounds', noMatch: noMatch});
			}
		});
	}
});

// CREATE - add new campground to DB
router.post("/", middleware.isLoggedIn, upload.single('image'), function(req, res) {
	// get data from form and add to campgrounds array
	req.body.campground.author = {
		id: req.user._id,
		username: req.user.username
	}
	geocoder.geocode(req.body.campground.location, function(err, data) {
    	// if (err || !data.length) {
      	// 	req.flash('error', 'Invalid address');
      	// 	return res.redirect('back');
    	// }
        req.body.campground.cost = req.body.campground.cost ? req.body.campground.cost : 0;
		// req.body.campground.lat = data[0].latitude;
        req.body.campground.lat = "";
    	// req.body.campground.lng = data[0].longitude;
    	req.body.campground.lng = "";
        // req.body.campground.location = data[0].formattedAddress;
		cloudinary.uploader.upload(req.file.path, function(result) {
			// add cloudinary url for the image to the campground object under image property
			req.body.campground.image = result.secure_url;
			Campground.create(req.body.campground, function(err, campground) {
    			if (err) {
					console.log(err);
      				req.flash('error', err.message);
      				return res.redirect('back');
    			}
				res.redirect('/campgrounds/' + campground._id);
			});
		});
	});
});

// NEW - show form to create new campground
router.get("/new", middleware.isLoggedIn, function(req, res) {
	res.render("campgrounds/new");
});

// SHOW - shows more info about one campground
router.get("/:id", function(req, res) {
    // find the campground with provided ID
	Campground.findById(req.params.id).populate("comments likes").populate({
    	path: "reviews",
        options: {sort: {createdAt: -1}}
    }).exec(function (err, foundCampground) {
		if (err || !foundCampground) {
			console.log(err);
			req.flash('error', 'Sorry, that memory does not exist!');
            return res.redirect('/campgrounds');
		} else {
			// render show template with that campground
			res.render("campgrounds/show", {campground: foundCampground});
		}
	});
});

// EDIT CAMPGROUND ROUTE
router.get("/:id/edit", middleware.checkCampgroundOwnership, function(req, res) {
    Campground.findById(req.params.id, function(err, foundCampground) {
        res.render("campgrounds/edit", {campground: foundCampground});
    });
});

// UPDATE CAMPGROUND ROUTE
router.put("/:id", middleware.checkCampgroundOwnership, upload.single('image'), function(req, res) {
	delete req.body.campground.rating;
    geocoder.geocode(req.body.campground.location, function(err, data) {
        // if (err || !data.length) {
        //     req.flash('error', 'Invalid address');
        //     return res.redirect('back');
        // }
        req.body.campground.cost = req.body.campground.cost ? req.body.campground.cost : 0;
		// req.body.campground.lat = data[0].latitude;
        req.body.campground.lat = "";
    	// req.body.campground.lng = data[0].longitude;
    	req.body.campground.lng = "";
        // req.body.campground.location = data[0].formattedAddress;
		let imagePath = req.file ? req.file.path : "";
        cloudinary.uploader.upload(imagePath, function(result) {
			if (result.secure_url) {
				req.body.campground.image = result.secure_url;
			}
			Campground.findByIdAndUpdate(req.params.id, req.body.campground, function(err, updatedCampground) {
                if (err) {
                    req.flash("error", err.message);
                    res.redirect("back");
                } else {
                    req.flash("success","Successfully Updated!");
                    res.redirect('/campgrounds/' + updatedCampground._id);
                }
            });
        });
    });
});

// DESTROY CAMPGROUND ROUTE
router.delete("/:id", middleware.checkCampgroundOwnership, function (req, res) {
    Campground.findById(req.params.id, function (err, campground) {
        if (err) {
            res.redirect("/campgrounds");
        } else {
            // deletes all comments associated with the campground
            Comment.remove({"_id": {$in: campground.comments}}, function (err) {
                if (err) {
                    console.log(err);
                    return res.redirect("/campgrounds");
                }
                // deletes all reviews associated with the campground
                Review.remove({"_id": {$in: campground.reviews}}, function (err) {
                    if (err) {
                        console.log(err);
                        return res.redirect("/campgrounds");
                    }
                    //  delete the campground
                    campground.remove();
                    req.flash("success", "Memory deleted successfully!");
                    res.redirect("/campgrounds");
                });
            });
        }
    });
});

// Campground Like Route
router.post("/:id/like", middleware.isLoggedIn, function (req, res) {
    Campground.findById(req.params.id, function (err, foundCampground) {
        if (err) {
            console.log(err);
            return res.redirect("/campgrounds");
        }

        // check if req.user._id exists in foundCampground.likes
        var foundUserLike = foundCampground.likes.some(function (like) {
            return like.equals(req.user._id);
        });

        if (foundUserLike) {
            // user already liked, removing like
            foundCampground.likes.pull(req.user._id);
        } else {
            // adding the new user like
            foundCampground.likes.push(req.user);
        }

        foundCampground.save(function (err) {
            if (err) {
                console.log(err);
                return res.redirect("/campgrounds");
            }
            return res.redirect("/campgrounds/" + foundCampground._id);
        });
    });
});

module.exports = router;
